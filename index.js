require("dotenv").config()
const express = require('express')
const path = require('path')
const { Saweria } = require('./lib/saweria')
const pay = new Saweria(process.env.USER_ID, process.env.TOKEN)
const storeRoutes = require('./store')
const app = express()
const PORT = 2007

app.use(storeRoutes)

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'store.html'))
})

app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'payment.html'))
})

/*
app.get('/tester', (req, res) => {
  res.sendFile(path.join(__dirname, 'tester.html'))
})
*/

app.get('/panduan-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'))
})

app.get('/panduan-user', (req, res) => {
  res.sendFile(path.join(__dirname, 'user.html'))
})

app.use((req, res) => {
  res.status(404).json({
    status: false,
    message: 'Route tidak ditemukan',
    available: ['/', '/panduan-admin', '/panduan-user']
  })
})

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
})