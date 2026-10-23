const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/azezobet";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('DB Error:', err));

const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    transactionId: { type: String, required: true },
    screenshotBase64: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

app.post('/api/auth/register', async (req, res) => {
    try {
        const { phone, password } = req.body;
        let user = await User.findOne({ phone });
        if (user) return res.status(400).json({ success: false, message: 'Phone registered' });
        const hashedPassword = await bcrypt.hash(password, 10);
        user = await User.create({ phone, password: hashedPassword });
        const token = jwt.sign({ id: user._id }, 'SECRET_KEY', { expiresIn: '7d' });
        res.json({ success: true, token, user: { _id: user._id, phone: user.phone, balance: user.balance } });
    } catch (error) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const user = await User.findOne({ phone });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ success: false, message: 'Wrong credentials' });
        }
        const token = jwt.sign({ id: user._id }, 'SECRET_KEY', { expiresIn: '7d' });
        res.json({ success: true, token, user: { _id: user._id, phone: user.phone, balance: user.balance } });
    } catch (error) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { userId, amount, transactionId, screenshotBase64 } = req.body;
        if (amount < 50 || amount > 1000) return res.status(400).json({ message: '50-1000 only' });
        if (!screenshotBase64) return res.status(400).json({ message: 'Screenshot required' });
        await Transaction.create({ userId, amount, transactionId, screenshotBase64 });
        res.json({ success: true, message: 'Sent for review' });
    } catch (error) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.get('/api/admin/deposits', async (req, res) => {
    try {
        const deposits = await Transaction.find({ status: 'pending' }).populate('userId', 'phone').sort({ createdAt: -1 });
        res.json({ success: true, deposits });
    } catch (error) { res.status(500).json({ success: false, message: 'Error' }); }
});

app.post('/api/admin/approve-deposit/:txnId', async (req, res) => {
    try {
        const txn = await Transaction.findById(req.params.txnId);
        if (!txn || txn.status !== 'pending') return res.status(400).json({ message: 'Already processed' });
        txn.status = 'approved';
        await txn.save();
        await User.findByIdAndUpdate(txn.userId, { $inc: { balance: txn.amount } });
        res.json({ success: true, message: 'Approved' });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.post('/api/play', async (req, res) => {
    try {
        const { userId, betAmount } = req.body;
        if (betAmount < 1 || betAmount > 50) return res.status(400).json({ message: '1-50 only' });
        const user = await User.findById(userId);
        if (user.balance < betAmount) return res.status(400).json({ message: 'Insufficient balance' });
        
        user.balance -= betAmount;
        const isWin = Math.random() > 0.5;
        const winAmount = isWin ? betAmount * 1.8 : 0;
        if (isWin) user.balance += winAmount;
        await user.save();
        
        res.json({ success: true, isWin, winAmount, newBalance: user.balance });
    } catch (error) { res.status(500).json({ message: 'Error' }); }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
module.exports = app;
