const axios = require('axios')
const moment = require('moment-timezone')

class QrisPW {
    constructor(apiKey = null, apiSecret = null) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.baseUrl = 'https://qris.pw/api';
    }

    _headers() {
        return {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
            'X-API-Secret': this.apiSecret
        };
    }

    async createPayment(amount, customerName, email, phone, msg = 'Payment') {
        try {
            if (!this.apiKey || !this.apiSecret) {
                return {
                    status: false,
                    msg: 'API Key atau API Secret tidak ditemukan'
                };
            }

            const orderId = 'ORDER-' + Date.now();

            const { data: res } = await axios.post(`${this.baseUrl}/create-payment.php`, {
                amount: Number(amount),
                order_id: orderId,
                customer_name: customerName,
                customer_phone: phone,
                callback_url: process.env.CALLBACK_URL || ''
            }, {
                headers: this._headers()
            });

            if (!res.success) {
                return {
                    status: false,
                    msg: res.message || 'Gagal membuat pembayaran'
                };
            }

            const now = moment().tz('Asia/Jakarta');

            return {
                status: true,
                data: {
                    amount: res.amount,
                    currency: 'IDR',
                    payment_type: 'qris',
                    message: msg,
                    id: res.transaction_id,
                    order_id: res.order_id,
                    status: 'pending',
                    created_at: moment(res.created_at).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm'),
                    expired_at: moment(res.expires_at).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm'),
                    receipt: `https://qris.pw/payment/${res.transaction_id}`,
                    // qris_url adalah URL gambar QR dari qris.pw
                    qr_image: res.qris_url,
                    qr_string: res.qris_string
                }
            };
        } catch (error) {
            console.error(error);
            return {
                status: false,
                msg: error.response?.data?.message || error.message
            };
        }
    }

    async checkPayment(id) {
        try {
            if (!this.apiKey || !this.apiSecret) {
                return {
                    status: false,
                    msg: 'API Key atau API Secret tidak ditemukan'
                };
            }

            const { data: res } = await axios.get(
                `${this.baseUrl}/check-payment.php?transaction_id=${id}`,
                { headers: this._headers() }
            );

            if (!res.success) {
                return {
                    status: false,
                    msg: res.message || 'Transaksi tidak ditemukan'
                };
            }

            const isPaid = res.status === 'paid';

            return {
                id: res.transaction_id,
                status: isPaid,
                msg: isPaid ? 'Berhasil' : res.status,
                date: res.paid_at ? moment(res.paid_at).tz('Asia/Jakarta').format('DD-MM-YYYY') : null,
                time: res.paid_at ? moment(res.paid_at).tz('Asia/Jakarta').format('HH:mm:ss') : null
            };
        } catch (error) {
            console.error(error);
            return {
                status: false,
                msg: error.response?.data?.message || error.message
            };
        }
    }
}

module.exports = { QrisPW };
