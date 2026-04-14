require('dotenv').config()
const express = require('express')
const path = require('path')
const crypto = require('crypto')
const axios = require('axios')
const { QrisPW } = require('./lib/qrispw')

const router = express.Router()
router.use(express.json())

const pay = new QrisPW(process.env.QRISPW_API_KEY, process.env.QRISPW_API_SECRET)

const PTERO_URL     = process.env.PTERO_URL
const APP_KEY       = process.env.PTERO_APP_KEY
const NODE_ID       = parseInt(process.env.PTERO_NODE_ID || '1')
const ALLOC_ID      = parseInt(process.env.PTERO_ALLOCATION_ID || '1')

const EGG_MAP = {
  paper:      parseInt(process.env.PTERO_MC_PAPER_EGG_ID     || '2'),
  forge:      parseInt(process.env.PTERO_MC_FORGE_EGG_ID     || '3'),
  vanilla:    parseInt(process.env.PTERO_MC_VANILA_EGG_ID    || '4'),
  bedrock:    parseInt(process.env.PTERO_MC_BEDROCK_EGG_ID   || '23'),
  velocity:   parseInt(process.env.PTERO_MC_VELOCITY_EGG_ID  || '24'),
  waterfall:  parseInt(process.env.PTERO_MC_WATERFALL_EGG_ID || '25'),
  limbo:      parseInt(process.env.PTERO_MC_LIMBO_EGG_ID     || '26'),
  nodejs:     parseInt(process.env.PTERO_NODE_EGG_ID         || '15'),
}

const NEST_MAP = {
  mc:   parseInt(process.env.PTERO_MC_NEST_ID   || '1'),
  node: parseInt(process.env.PTERO_NODE_NEST_ID || '5'),
}

const pteroHeaders = {
  Authorization: `Bearer ${APP_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/vnd.pterodactyl.v1+json',
}

const PLANS = {
  node: {
    starter: { name: 'Node.js · Starter', price: 5000,  ram: 2048,  disk: 5120,  cpu: 40,  db: 1 },
    basic:   { name: 'Node.js · Basic',   price: 10000, ram: 4096,  disk: 10240, cpu: 60,  db: 1 },
    pro:     { name: 'Node.js · Pro',     price: 15000, ram: 6144,  disk: 15360, cpu: 80,  db: 2 },
    ultra:   { name: 'Node.js · Ultra',   price: 20000, ram: 8192,  disk: 20480, cpu: 100, db: 2 },
  },
  mc: {
    starter: { name: 'Minecraft · Starter', price: 10000, ram: 2048,  disk: 8192,  cpu: 60,  db: 0, slots: 10 },
    basic:   { name: 'Minecraft · Basic',   price: 20000, ram: 4096,  disk: 15360, cpu: 80,  db: 0, slots: 20 },
    pro:     { name: 'Minecraft · Pro',     price: 35000, ram: 6144,  disk: 25600, cpu: 100, db: 0, slots: 35 },
    ultra:   { name: 'Minecraft · Ultra',   price: 50000, ram: 8192,  disk: 40960, cpu: 150, db: 0, slots: 50 },
  }
}

const pendingOrders = new Map()

const coupons = new Map()

const COUPON_API_KEY = process.env.COUPON_API_KEY || 'coupon-admin-key'

function verifyCouponKey(req, res) {
  const key = req.headers['x-api-key'] || req.body?.apiKey
  if (key !== COUPON_API_KEY) {
    res.status(403).json({ status: false, message: 'API key tidak valid' })
    return false
  }
  return true
}

function applyCoupon(code, originalPrice) {
  if (!code) return { valid: false }
  const c = coupons.get(code.toUpperCase())
  if (!c) return { valid: false, message: 'Kode kupon tidak ditemukan' }
  if (c.expiresAt && Date.now() > c.expiresAt) return { valid: false, message: 'Kupon sudah kedaluwarsa' }
  if (c.maxUses && c.uses >= c.maxUses) return { valid: false, message: 'Kupon sudah habis digunakan' }

  let discount = 0
  if (c.type === 'percent') discount = Math.floor(originalPrice * c.discount / 100)
  else if (c.type === 'fixed') discount = Math.min(c.discount, originalPrice)

  const finalPrice = Math.max(0, originalPrice - discount)
  return { valid: true, discount, finalPrice, coupon: c }
}


function generatePassword(len = 12) {
  return crypto.randomBytes(len).toString('base64').slice(0, len)
    .replace(/[+/=]/g, 'X')
}

async function getAvailableAllocation(nodeId) {
  try {
    const res = await axios.get(
      `${PTERO_URL}/api/application/nodes/${nodeId}/allocations?per_page=100`,
      { headers: pteroHeaders }
    )
    const allocs = res.data.data
    const free = allocs.find(a => !a.attributes.assigned)
    return free ? free.attributes.id : ALLOC_ID
  } catch(e) {
    console.error('[Ptero] Gagal ambil allocation:', e.response?.data || e.message)
    return ALLOC_ID
  }
}

async function getAllocationAddress(allocId) {
  try {
    const res = await axios.get(
      `${PTERO_URL}/api/application/nodes/${NODE_ID}/allocations?per_page=100`,
      { headers: pteroHeaders }
    )
    const alloc = res.data.data.find(a => a.attributes.id === allocId)
    if (!alloc) return null
    return `${alloc.attributes.ip}:${alloc.attributes.port}`
  } catch(e) {
    return null
  }
}

async function createPteroUser(email, username, firstName, password) {
  const res = await axios.post(`${PTERO_URL}/api/application/users`, {
    email,
    username: username.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20),
    first_name: firstName,
    last_name: 'User',
    password,
  }, { headers: pteroHeaders })
  return res.data.attributes
}

async function createPteroServer(userId, serverName, plan, eggId, nestId, allocId, type, eggKey, versionOpts) {
  const { version = '', forgeVersion = '', bedrockName = '' } = versionOpts || {}

  const EGG_CFG = {
    nodejs: {
      docker_image: 'ghcr.io/pterodactyl/yolks:nodejs_20',
      startup: 'if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == "1" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; if [[ ! -z ${CUSTOM_ENVIRONMENT_VARIABLES} ]]; then vars=$(echo ${CUSTOM_ENVIRONMENT_VARIABLES} | tr ";" "\n"); for line in $vars; do export $line; done fi; /usr/local/bin/${CMD_RUN};',
      environment: {
        INST: 'npm', USER_UPLOAD: '0', AUTO_UPDATE: '0',
        CMD_RUN: 'npm start', NODE_PACKAGES: '', UNNODE_PACKAGES: '',
        CUSTOM_ENVIRONMENT_VARIABLES: '',
      },
    },
    paper: {
      docker_image: 'ghcr.io/pterodactyl/yolks:java_21',
      startup: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}',
      environment: {
        MINECRAFT_VERSION: version || 'latest',
        SERVER_JARFILE: 'server.jar',
        DL_PATH: '',
        BUILD_NUMBER: 'latest',
      },
    },
    vanilla: {
      docker_image: 'ghcr.io/pterodactyl/yolks:java_21',
      startup: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}',
      environment: {
        SERVER_JARFILE: 'server.jar',
        VANILLA_VERSION: version || 'latest',
      },
    },
    forge: {
      docker_image: 'ghcr.io/pterodactyl/yolks:java_21',
      startup: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -Dterminal.jline=false -Dterminal.ansi=true $( [[  ! -f unix_args.txt ]] && printf %s "-jar {{SERVER_JARFILE}}" || printf %s "@unix_args.txt" )',
      environment: {
        SERVER_JARFILE: 'server.jar',
        MC_VERSION: version || 'latest',
        BUILD_TYPE: 'recommended',
        FORGE_VERSION: forgeVersion || '',
      },
    },
    bedrock: {
      docker_image: 'ghcr.io/ptero-eggs/yolks:debian',
      startup: './bedrock_server',
      environment: {
        BEDROCK_VERSION: version || 'latest',
        LD_LIBRARY_PATH: '.',
        SERVERNAME: bedrockName || serverName,
        GAMEMODE: 'survival',
        DIFFICULTY: 'easy',
        CHEATS: 'false',
      },
    },
    velocity: {
      docker_image: 'ghcr.io/ptero-eggs/yolks:java_21',
      startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -XX:+UseG1GC -XX:G1HeapRegionSize=4M -XX:+UnlockExperimentalVMOptions -XX:+ParallelRefProcEnabled -XX:+AlwaysPreTouch -XX:MaxInlineLevel=15 -jar {{SERVER_JARFILE}}',
      environment: {
        VELOCITY_VERSION: version || 'latest',
        SERVER_JARFILE: 'velocity.jar',
        DL_PATH: '',
        BUILD_NUMBER: 'latest',
      },
    },
    waterfall: {
      docker_image: 'ghcr.io/ptero-eggs/yolks:java_21',
      startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}',
      environment: {
        MINECRAFT_VERSION: version || 'latest',
        SERVER_JARFILE: 'waterfall.jar',
        DL_LINK: '',
        BUILD_NUMBER: 'latest',
      },
    },
    limbo: {
      docker_image: 'ghcr.io/pterodactyl/yolks:java_21',
      startup: 'java -Xms128M -Xmx{{SERVER_MEMORY}}M -jar {{SERVER_JARFILE}}',
      environment: {
        MINECRAFT_VERSION: version || 'latest',
        SERVER_JARFILE: 'server.jar',
      },
    },
  }

  const key = type === 'mc' ? (eggKey || 'paper') : 'nodejs'
  const cfg = EGG_CFG[key] || EGG_CFG.paper

  const serverData = {
    name: serverName,
    user: userId,
    egg: eggId,
    docker_image: cfg.docker_image,
    startup: cfg.startup,
    environment: cfg.environment,
    limits: {
      memory: plan.ram,
      swap: 0,
      disk: plan.disk,
      io: 500,
      cpu: plan.cpu,
    },
    feature_limits: {
      databases: plan.db || 0,
      backups: 2,
      allocations: 1,
    },
    allocation: { default: allocId },
    nest: nestId,
    start_on_completion: true,
  }

  const res = await axios.post(`${PTERO_URL}/api/application/servers`, serverData, { headers: pteroHeaders })
  return res.data.attributes
}




router.post('/api/order', async (req, res) => {
  try {
    const { type, tier, egg, name, email, phone, serverName, version, forgeVersion, bedrockName, couponCode } = req.body

    if (!type || !tier || !name || !email || !phone || !serverName) {
      return res.json({ status: false, message: 'Data tidak lengkap' })
    }
    if (!PLANS[type]?.[tier]) {
      return res.json({ status: false, message: 'Paket tidak valid' })
    }

    const plan = PLANS[type][tier]
    const eggKey = type === 'mc' ? (egg || 'paper') : 'nodejs'

    let finalPrice = plan.price
    let couponDiscount = 0
    let usedCoupon = null
    if (couponCode) {
      const result = applyCoupon(couponCode, plan.price)
      if (!result.valid) return res.json({ status: false, message: result.message || 'Kupon tidak valid' })
      finalPrice    = result.finalPrice
      couponDiscount = result.discount
      usedCoupon    = couponCode.toUpperCase()
    }

    const payment = await pay.createPayment(
      finalPrice,
      name,
      email,
      phone,
      `XBotz - ${plan.name} - ${serverName}${usedCoupon ? ' [KUPON: ' + usedCoupon + ']' : ''}`
    )

    if (!payment.status) {
      return res.json({ status: false, message: payment.msg || 'Gagal membuat pembayaran' })
    }

    if (usedCoupon && coupons.has(usedCoupon)) {
      coupons.get(usedCoupon).uses += 1
    }

    pendingOrders.set(payment.data.id, {
      type, tier, eggKey, name, email, phone, serverName,
      version: version || '', forgeVersion: forgeVersion || '', bedrockName: bedrockName || '',
      plan, couponCode: usedCoupon, couponDiscount, finalPrice,
      createdAt: Date.now()
    })

    setTimeout(() => pendingOrders.delete(payment.data.id), 15 * 60 * 1000)

    console.log(`[Order] ${payment.data.id} — ${plan.name} — ${email}${usedCoupon ? ' — KUPON: ' + usedCoupon + ' -Rp' + couponDiscount : ''}`)

    return res.json({ status: true, payment: payment.data, discount: couponDiscount, finalPrice })
  } catch(e) {
    console.error('[Order Error]', e.message)
    return res.json({ status: false, message: 'Internal server error' })
  }
})

router.post('/api/check-payment', async (req, res) => {
  try {
    const { id } = req.body
    if (!id) return res.json({ status: false, message: 'ID transaksi kosong' })

    const payStatus = await pay.checkPayment(id)

    if (!payStatus.status) {
      return res.json({ status: false, payment_status: 'pending', message: 'Belum dibayar' })
    }

    const order = pendingOrders.get(id)
    if (!order) {
      return res.json({ status: false, message: 'Order tidak ditemukan atau sudah diproses' })
    }

    pendingOrders.delete(id)

    console.log(`[Payment OK] ${id} — mulai buat server untuk ${order.email}`)

    const password = generatePassword(14)
    const eggId   = EGG_MAP[order.eggKey] || EGG_MAP.nodejs
    const nestId  = NEST_MAP[order.type]
    const allocId = await getAvailableAllocation(NODE_ID)

    let pteroUser
    try {
      pteroUser = await createPteroUser(
        order.email,
        order.name + '_' + Date.now().toString().slice(-4),
        order.name,
        password
      )
    } catch(e) {
      if (e.response?.status === 422) {
        const usersRes = await axios.get(
          `${PTERO_URL}/api/application/users?filter[email]=${encodeURIComponent(order.email)}`,
          { headers: pteroHeaders }
        )
        if (usersRes.data.data.length > 0) {
          pteroUser = usersRes.data.data[0].attributes
        } else {
          throw e
        }
      } else throw e
    }

    const server = await createPteroServer(
      pteroUser.id,
      order.serverName,
      order.plan,
      eggId,
      nestId,
      allocId,
      order.type,
      order.eggKey,
      { version: order.version, forgeVersion: order.forgeVersion, bedrockName: order.bedrockName }
    )

    const address = await getAllocationAddress(allocId)

    console.log(`[Server Created] ${server.uuid} — User: ${pteroUser.email}`)

    return res.json({
      status: true,
      date: payStatus.date,
      time: payStatus.time,
      server: {
        panelUrl: PTERO_URL,
        email: pteroUser.email,
        password,
        serverName: server.name,
        serverUuid: server.uuid,
        address: address || '(cek di panel)',
        plan: order.plan.name,
        amount: order.plan.price,
      }
    })

  } catch(e) {
    console.error('[Check Payment Error]', e.response?.data || e.message)
    return res.json({ status: false, message: 'Gagal membuat server: ' + (e.response?.data?.errors?.[0]?.detail || e.message) })
  }
})

router.post('/api/coupon', (req, res) => {
  if (!verifyCouponKey(req, res)) return
  const { code, discount, type, maxUses, expiresInDays } = req.body

  if (!code || !discount || !type) {
    return res.json({ status: false, message: 'code, discount, type wajib diisi' })
  }
  if (!['percent', 'fixed'].includes(type)) {
    return res.json({ status: false, message: 'type harus: percent | fixed' })
  }
  if (type === 'percent' && (discount < 1 || discount > 100)) {
    return res.json({ status: false, message: 'Diskon persen harus 1–100' })
  }

  const key = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const expiresAt = expiresInDays ? Date.now() + expiresInDays * 86400000 : null

  const existing = coupons.get(key)
  coupons.set(key, {
    discount:    parseFloat(discount),
    type,
    maxUses:     maxUses ? parseInt(maxUses) : null,
    uses:        existing?.uses || 0,
    expiresAt,
    createdAt:   existing?.createdAt || Date.now(),
  })

  console.log(`[Coupon] ${existing ? 'Updated' : 'Created'}: ${key} — ${discount}${type === 'percent' ? '%' : 'Rp'} — maxUses: ${maxUses || '∞'}`)
  return res.json({ status: true, message: existing ? 'Kupon diperbarui' : 'Kupon dibuat', code: key })
})

router.post('/api/coupon/list', (req, res) => {
  if (!verifyCouponKey(req, res)) return
  const list = []
  coupons.forEach((v, k) => {
    list.push({
      code:       k,
      discount:   v.discount,
      type:       v.type,
      maxUses:    v.maxUses,
      uses:       v.uses,
      expiresAt:  v.expiresAt ? new Date(v.expiresAt).toISOString() : null,
      expired:    v.expiresAt ? Date.now() > v.expiresAt : false,
      exhausted:  v.maxUses ? v.uses >= v.maxUses : false,
    })
  })
  return res.json({ status: true, total: list.length, coupons: list })
})

router.post('/api/coupon/delete', (req, res) => {
  if (!verifyCouponKey(req, res)) return
  const { code } = req.body
  if (!code) return res.json({ status: false, message: 'code wajib diisi' })
  const key = code.toUpperCase()
  if (!coupons.has(key)) return res.json({ status: false, message: 'Kupon tidak ditemukan' })
  coupons.delete(key)
  console.log(`[Coupon] Deleted: ${key}`)
  return res.json({ status: true, message: 'Kupon dihapus' })
})

router.post('/api/coupon/validate', (req, res) => {
  const { code, price } = req.body
  if (!code || !price) return res.json({ status: false, message: 'code dan price wajib' })
  const result = applyCoupon(code, parseInt(price))
  if (!result.valid) return res.json({ status: false, message: result.message })
  return res.json({
    status:    true,
    discount:  result.discount,
    finalPrice: result.finalPrice,
    type:      result.coupon.type,
    value:     result.coupon.discount,
  })
})

/*

router.post('/api/test-create', async (req, res) => {
  try {
    const { type, tier, egg, name, email, serverName, secretKey, version, forgeVersion, bedrockName } = req.body

    if (secretKey !== (process.env.TEST_SECRET || 'xaihost-test-2025')) {
      return res.status(403).json({ status: false, message: 'Akses ditolak' })
    }

    if (!type || !tier || !name || !email || !serverName) {
      return res.json({ status: false, message: 'Data tidak lengkap' })
    }
    if (!PLANS[type]?.[tier]) {
      return res.json({ status: false, message: 'Paket tidak valid' })
    }

    const plan   = PLANS[type][tier]
    const eggKey = type === 'mc' ? (egg || 'paper') : 'nodejs'
    const eggId  = EGG_MAP[eggKey] || EGG_MAP.nodejs
    const nestId = NEST_MAP[type]

    console.log(`[TEST] Buat server — ${plan.name} — ${email}`)

    const password = generatePassword(14)
    const allocId  = await getAvailableAllocation(NODE_ID)

    let pteroUser
    try {
      pteroUser = await createPteroUser(
        email,
        name + '_' + Date.now().toString().slice(-4),
        name,
        password
      )
    } catch(e) {
      if (e.response?.status === 422) {
        const usersRes = await axios.get(
          `${PTERO_URL}/api/application/users?filter[email]=${encodeURIComponent(email)}`,
          { headers: pteroHeaders }
        )
        if (usersRes.data.data.length > 0) {
          pteroUser = usersRes.data.data[0].attributes
        } else throw e
      } else throw e
    }

    const server  = await createPteroServer(
      pteroUser.id, serverName, plan, eggId, nestId, allocId, type, eggKey,
      { version: version || '', forgeVersion: forgeVersion || '', bedrockName: bedrockName || '' }
    )
    const address = await getAllocationAddress(allocId)

    console.log(`[TEST OK] ${server.uuid} — ${pteroUser.email}`)

    return res.json({
      status: true,
      server: {
        panelUrl:   PTERO_URL,
        email:      pteroUser.email,
        password,
        serverName: server.name,
        serverUuid: server.uuid,
        address:    address || '(cek di panel)',
        plan:       plan.name,
        eggKey,
        nestId,
        eggId,
        allocId,
      }
    })
  } catch(e) {
    console.error('[TEST Error]', e.response?.data || e.message)
    return res.json({
      status: false,
      message: e.response?.data?.errors?.[0]?.detail || e.message,
      raw: e.response?.data || null
    })
  }
})
*/

module.exports = router
