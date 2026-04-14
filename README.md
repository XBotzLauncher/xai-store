# XAiHost — Panel Hosting Pterodactyl

Store otomatis untuk hosting **Node.js** & **Minecraft** berbasis Pterodactyl. Pembayaran via **QRIS Saweria** — scan, bayar, server langsung dibuat tanpa konfirmasi manual.

---

## Fitur

- **Order otomatis** — user isi form → bayar QRIS → server Pterodactyl langsung dibuat
- **Halaman pembayaran terpisah** — tahan refresh, state tersimpan di `sessionStorage`
- **Kupon diskon** — tipe persen atau nominal, bisa set max pemakaian & expired
- **Multi egg Minecraft** — Paper, Vanilla, Forge, Bedrock, Velocity, Waterfall, Limbo
- **Input versi** — user pilih versi Minecraft/Bedrock/Velocity/Waterfall sendiri
- **Internal tester** — halaman khusus buat server tanpa flow pembayaran (untuk testing)
- **Panduan user & admin** — halaman dokumentasi terpisah

---

## Struktur File

```
.
├── index.js          # Entry point Express
├── store.js          # Routes API (order, payment, coupon, tester)
├── store.html        # Halaman utama store
├── payment.html      # Halaman pembayaran QRIS
├── tester.html       # Internal tester (nonaktif by default)
├── admin.html        # Panduan admin
├── user.html         # Panduan user
├── lib/
│   └── saweria.js    # Wrapper Saweria QRIS API
├── .env.example      # Contoh environment variables
└── package.json
```

---

## Instalasi

```bash
# Clone repo
git clone https://github.com/username/xaihost.git
cd xaihost

# Install dependencies
npm install

# Setup environment
cp .env.example .env
nano .env

# Jalankan
npm start
```

Server jalan di `http://localhost:2008`

---

## Environment Variables

Salin `.env.example` ke `.env` lalu isi:

```env
# Saweria (untuk QRIS)
USER_ID=         # User ID Saweria kamu
TOKEN=           # Token Saweria (opsional tergantung versi)

# Pterodactyl Panel
PTERO_URL=https://panel.example.com
PTERO_APP_KEY=ptla_xxxxxxxxxxxx        # Application API key
PTERO_NODE_ID=1                        # ID node yang dipakai
PTERO_ALLOCATION_ID=1                  # Fallback allocation ID

# Nest & Egg IDs (sesuaikan dengan panel kamu)
PTERO_MC_NEST_ID=1
PTERO_NODE_NEST_ID=5
PTERO_MC_PAPER_EGG_ID=2
PTERO_MC_FORGE_EGG_ID=3
PTERO_MC_VANILA_EGG_ID=4
PTERO_MC_BEDROCK_EGG_ID=23
PTERO_MC_VELOCITY_EGG_ID=24
PTERO_MC_WATERFALL_EGG_ID=25
PTERO_MC_LIMBO_EGG_ID=26
PTERO_NODE_EGG_ID=15

# Secret keys
COUPON_API_KEY=ganti-ini-aman          # Key untuk manage kupon
TEST_SECRET=xaihost-test-2025          # Key untuk akses /tester
```

---

## API Routes

### Public

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/` | Halaman store utama |
| `GET` | `/payment?id=...` | Halaman pembayaran |
| `GET` | `/panduan-user` | Panduan user |
| `GET` | `/panduan-admin` | Panduan admin |
| `POST` | `/api/order` | Buat order & generate QRIS |
| `POST` | `/api/check-payment` | Cek status bayar & buat server |
| `POST` | `/api/coupon/validate` | Validasi kode kupon |

### Coupon Management (butuh `x-api-key` header)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/coupon` | Buat / update kupon |
| `POST` | `/api/coupon/list` | List semua kupon |
| `POST` | `/api/coupon/delete` | Hapus kupon |

#### Contoh buat kupon

```bash
# Diskon 30%
curl -X POST https://domain.com/api/coupon \
  -H "Content-Type: application/json" \
  -H "x-api-key: COUPON_API_KEY_KAMU" \
  -d '{
    "code": "DISKON30",
    "type": "percent",
    "discount": 30,
    "maxUses": 100,
    "expiresInDays": 7
  }'

# Diskon nominal Rp5.000
curl -X POST https://domain.com/api/coupon \
  -H "Content-Type: application/json" \
  -H "x-api-key: COUPON_API_KEY_KAMU" \
  -d '{
    "code": "HEMAT5K",
    "type": "fixed",
    "discount": 5000
  }'
```

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `code` | string | Kode kupon (huruf besar otomatis) |
| `type` | `percent` \| `fixed` | Tipe diskon |
| `discount` | number | Nilai diskon (% atau Rp) |
| `maxUses` | number | Max pemakaian, kosongkan = unlimited |
| `expiresInDays` | number | Expired dalam N hari, kosongkan = tidak ada |

### Internal Tester (butuh `secretKey` di body)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/tester` | Halaman tester (aktifkan dulu di `index.js`) |
| `POST` | `/api/test-create` | Buat server langsung tanpa pembayaran |

Untuk mengaktifkan halaman tester, uncomment baris ini di `index.js`:

```js
// app.get('/tester', (req, res) => {
//   res.sendFile(path.join(__dirname, 'tester.html'))
// })
```

> **Ingat:** nonaktifkan kembali sebelum deploy ke production.

---

## Paket yang Tersedia

### Node.js

| Paket | RAM | Disk | CPU | DB | Harga |
|-------|-----|------|-----|----|-------|
| Starter | 2 GB | 5 GB | 40% | 1 | Rp5.000/bln |
| Basic | 4 GB | 10 GB | 60% | 1 | Rp10.000/bln |
| Pro | 6 GB | 15 GB | 80% | 2 | Rp15.000/bln |
| Ultra | 8 GB | 20 GB | 100% | 2 | Rp20.000/bln |

### Minecraft

| Paket | RAM | Disk | CPU | Slot | Harga |
|-------|-----|------|-----|------|-------|
| Starter | 2 GB | 8 GB | 60% | 10 | Rp10.000/bln |
| Basic | 4 GB | 15 GB | 80% | 20 | Rp20.000/bln |
| Pro | 6 GB | 25 GB | 100% | 35 | Rp35.000/bln |
| Ultra | 8 GB | 40 GB | 150% | 50 | Rp50.000/bln |

---

## Egg yang Didukung

| Egg | Docker Image | Versi Env |
|-----|-------------|-----------|
| Paper | `pterodactyl/yolks:java_21` | `MINECRAFT_VERSION` |
| Vanilla | `pterodactyl/yolks:java_21` | `VANILLA_VERSION` |
| Forge | `pterodactyl/yolks:java_21` | `MC_VERSION` + `FORGE_VERSION` |
| Bedrock | `ptero-eggs/yolks:debian` | `BEDROCK_VERSION` |
| Velocity | `ptero-eggs/yolks:java_21` | `VELOCITY_VERSION` |
| Waterfall | `ptero-eggs/yolks:java_21` | `MINECRAFT_VERSION` |
| Limbo | `pterodactyl/yolks:java_21` | `MINECRAFT_VERSION` |
| Node.js | `pterodactyl/yolks:nodejs_20` | `CMD_RUN` |

---

## Flow Pembelian

```
User pilih paket
      ↓
Isi form (nama, email, WA, nama server, versi, egg, kupon)
      ↓
POST /api/order → Saweria generate QRIS
      ↓
Redirect ke /payment?id=xxx (state disimpan sessionStorage)
      ↓
User scan & bayar QRIS
      ↓
POST /api/check-payment → verifikasi ke Saweria
      ↓
Pterodactyl: buat user + server otomatis
      ↓
Tampil kredensial (panel URL, email, password, IP:port)
```

---

## Dependencies

| Package | Versi | Fungsi |
|---------|-------|--------|
| `express` | ^5.2.1 | Web server |
| `axios` | ^1.15.0 | HTTP client (Pterodactyl & Saweria) |
| `dotenv` | ^17.4.2 | Environment variables |
| `qrcode` | ^1.5.4 | Generate QR image dari string QRIS |
| `cheerio` | ^1.2.0 | Scraping receipt Saweria |
| `moment-timezone` | ^0.6.1 | Format waktu WIB |

---

## License

ISC
# xai-store
