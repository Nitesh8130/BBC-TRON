var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var deposit = new Schema({
    fromAddress : String,
    toAddress : String,
    amount : Number,
    blockNum : Number,
    tranId : String,
    status : ['PENDING', 'COMPLETED'],
    createdAt: Date,
    lastModified: Date
});

module.exports = mongoose.model('deposit', deposit);