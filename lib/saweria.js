const qrcode = require('qrcode')
const cheerio = require('cheerio')
const moment = require('moment-timezone')
const axios = require('axios')

const HEADERS = {
    'Content-Type': 'application/json',
    'Origin': 'https://saweria.co',
    'Referer': 'https://saweria.co/login',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
}

class Saweria {
    constructor(user_id = null, token = null) {
        this.user_id = user_id;
        this.baseUrl = 'https://saweria.co';
        this.apiUrl = 'https://backend.saweria.co';
        this.token = token;
    }

    async createPayment(amount, username, email, phone, msg = 'Donate') {
        try {
            if (!this.user_id) {
                return {
                    status: false,
                    msg: 'User id not found'
                };
            }

            const {
                data: res
            } = await axios.post(`${this.apiUrl}/donations/${this.user_id}`, {
                agree: true,
                amount: Number(amount),
                customer_info: {
                    first_name: username,
                    email: email,
                    phone: phone,
                },
                message: msg,
                notUnderAge: true,
                payment_type: 'qris',
                vote: ''
            }, {
                headers: HEADERS
            });

            const data = res.data;

            if (!data || !data.id) {
                return {
                    status: false,
                    msg: 'Failed to create payment'
                };
            }

            const qr_image = await qrcode.toDataURL(data.qr_string, {
                scale: 8
            });

            return {
                status: true,
                data: {
                    amount: data.amount,
                    currency: data.currency,
                    payment_type: data.payment_type,
                    message: data.message,
                    id: data.id,
                    status: data.status,
                    type: data.type,
                    etc: data.etc,
                    created_at: moment(data.created_at).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm'),
                    expired_at: moment(data.created_at).add(10, 'minutes').tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm'),
                    receipt: `${this.baseUrl}/qris/${data.id}`,
                    qr_image
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
            if (!this.user_id) {
                return {
                    status: false,
                    msg: 'User id not found'
                };
            }

            const {
                data: text
            } = await axios.get(
                `${this.baseUrl}/receipt/${id}`, {
                    headers: {
                        Accept: '*/*'
                    },
                    responseType: 'text'
                }
            );

            const $ = cheerio.load(text);

            const msg = $('h2.chakra-heading.css-14dtuui').text().trim();

            if (!msg) {
                return {
                    status: false,
                    msg: 'Transaction not found or not completed'
                };
            }

            const result = {};

            $('.css-1lekzkb').each((i, el) => {
                const label = $(el).find('p').text().trim();
                const value = $(el).find('input').val();

                if (label === 'ID:') result.id = value;
                else if (value?.includes(':')) result.time = value;
                else if (value?.includes('-')) result.date = value;
            });

            const normalized = msg.toUpperCase();

            const statusMap = {
                OA4XSN: 'Berhasil'
            };

            return {
                id: result.id,
                status: normalized === 'OA4XSN',
                msg: statusMap[normalized] || normalized,
                date: result.date,
                time: result.time
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

module.exports = {
    Saweria
}