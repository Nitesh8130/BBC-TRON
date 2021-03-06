var config = require('../../config/'+process.env.ENV_CONFIG)
var TransactionRepository = require('../repository/TransactionRepository.js')
var TronWeb = require("tronweb");
var axios = require('axios');

const tronweb = new TronWeb(
    config.FULL_NODE,
    config.SOLLYDITY_NODE 
);

exports.processBlock = async (processBlockInfo) => {
    return await processBlockInfo.then((blockInfo) => {
        for(let key in blockInfo.transactions){
            var trxns = blockInfo.transactions[key].raw_data.contract[0];
            if(trxns.type === 'TransferContract'){ processBlockData(blockInfo, trxns, key);}
        }
    }).catch((err) => {
        // console.log('applicable....', err);
    })
}

const processBlockData = async (processBlockInfo, trxns, key) => {
    var fromAddress = await tronweb.address.fromHex(trxns.parameter.value.owner_address);
    var toAddress = await tronweb.address.fromHex(trxns.parameter.value.to_address);
    var amount = trxns.parameter.value.amount;

    //prepare data.
    var depositDto = {
        fromAddress: fromAddress,
        toAddress: toAddress,
        amount: amount,
        transactionHash : processBlockInfo.transactions[key].txID
    }
    //Validate toAddress from our exchange database.
    await axios.get('http://localhost:8060/api/v1/coin/walletAddress/search/address', {
        params: {
            address: toAddress,
            projection: "userAddressForTron"
        }
    }).then(userWallet => {
        if(userWallet.data.address !== null){
            console.log('Incoming Transaction for Address ---', toAddress);
            if (!userWallet.data.InBinanceDeposit){
                sendTransationToOrganization(depositDto, userWallet.data.userPrivateKey);
            }else {
                incomingTransaction(depositDto);
            }
        }
    }).catch(err => {
        if(err.code === 'ECONNREFUSED'){
            onConnectionRefusedTransaction(depositDto);
        }
        console.log("Address is not present in b-exchange database.");
    })
}   

/**
 * @Important :: Any transaction which is made for our exchange then we sent the amount to organization address from user address.
 * and in the next method we just updating user wallet by adding amount with some detail.
 * @param {*} depositDto 
 * @param {*} userPrivateKey 
 */
const sendTransationToOrganization = async (depositDto, userPrivateKey) => {
    console.log("user private key -------------", userPrivateKey);
    console.log("Transfer to organization address -------------", config.ORG_ADDRESS);
    await tronweb.trx.sendTransaction(config.ORG_ADDRESS, depositDto.amount, userPrivateKey).then(result => {
        if(result !== null){
            incomingTransaction(depositDto);
        }
    }).catch(err => {
        console.log('Error While Transfering Amount to Organization Wallet ::: ', err);
    });
}

/**
* @Important : In this method we are calling deposit api of tron of our exchange and update the user wallet balance. And if in case
* deposit is fail then we save the transaction when the our exchange will work.
* THREE WAY WE CAN CALL THE EXTERNAL API.
* @https
* @axios (to do this, use command to install- npm install axios@0.16.2)
* @request (to do this, use command to install- npm install request@2.81.0)
* 
*/
async function incomingTransaction(depositDto){
    await axios.post('http://localhost:8060/api/v1/coin/deposit/tron', depositDto).then(result => {
        if(result !== null){
            console.log("Amount Deposit to the user wallet ::: Success");
        }
    }).catch(err => {
        saveUserIncomingTrxInMongoDb(depositDto);
    });
}

/**
 * @Important : this method is call when the connection is refused during validate address.
 * so when the connection is esteblished, again we process transaction.
 * @param {} depositDto 
 */
const onConnectionRefusedTransaction = async (depositDto) => {
    var tranInfo = {
        fromAddress : depositDto.fromAddress,
        toAddress : depositDto.toAddress,
        amount : depositDto.amount,
        transactionHash : depositDto.transactionHash,
        status : 'ECONNREFUSED',
        createdAt: new Date(),
        lastModified: new Date()
    }
    return TransactionRepository.postDeposit(tranInfo);
}

/**
 * @Important : Saving pending transaction in local database for later process.
 * @param {*} depositDto 
 */
function saveUserIncomingTrxInMongoDb(depositDto){
    TransactionRepository.findByTxnHash(depositDto.transactionHash).then(result => {
        if(result.data == null){
            var tranInfo = {
                fromAddress : depositDto.fromAddress,
                toAddress : depositDto.toAddress,
                amount : depositDto.amount,
                transactionHash : depositDto.transactionHash,
                status : 'PENDING',
                createdAt: new Date(),
                lastModified: new Date()
            }
            return TransactionRepository.postDeposit(tranInfo);
        }else{
            console.log('Transation id already exit ::: ');
        }
    }).catch(err => {
        console.log('Error while finding exiting Transaction ::: ')
    });
}