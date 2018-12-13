
const crypto 		= require('crypto');
const moment 		= require('moment');
const MongoClient 	= require('mongodb').MongoClient;

var db, accounts, recorder, balance;
MongoClient.connect(process.env.DB_URL, { useNewUrlParser: true }, function(e, client) {
	if (e){
		console.log(e);
	}	else{
		db = client.db(process.env.DB_NAME);
		accounts = db.collection('accounts');
		balance = db.collection('balance');
		recorder = db.collection('recorder');
	// index fields 'user' & 'email' for faster new account validation //
		accounts.createIndex({user: 1, email: 1});
		console.log('mongo :: connected to database :: "'+process.env.DB_NAME+'"');
	}
});

const guid = function(){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});}

/*
	login validation methods
*/

exports.autoLogin = function(user, pass, callback)
{
	accounts.findOne({user:user}, function(e, o) {
		if (o){
			o.pass == pass ? callback(o) : callback(null);
		}	else{
			callback(null);
		}
	});
}

exports.manualLogin = function(user, pass, callback)
{
	accounts.findOne({user:user}, function(e, o) {
		if (o == null){
			callback('user-not-found');
		}	else{
			validatePassword(pass, o.pass, function(err, res) {
				if (res){
					callback(null, o);
				}	else{
					callback('invalid-password');
				}
			});
		}
	});
}

exports.generateLoginKey = function(user, ipAddress, callback)
{
	let cookie = guid();
	accounts.findOneAndUpdate({user:user}, {$set:{
		ip : ipAddress,
		cookie : cookie
	}}, {returnOriginal : false}, function(e, o){ 
		callback(cookie);
	});
}

exports.validateLoginKey = function(cookie, ipAddress, callback)
{
// ensure the cookie maps to the user's last recorded ip address //
	accounts.findOne({cookie:cookie, ip:ipAddress}, callback);
}

exports.generatePasswordKey = function(email, ipAddress, callback)
{
	let passKey = guid();
	accounts.findOneAndUpdate({email:email}, {$set:{
		ip : ipAddress,
		passKey : passKey
	}, $unset:{cookie:''}}, {returnOriginal : false}, function(e, o){
		if (o.value != null){
			callback(null, o.value);
		}	else{
			callback(e || 'account not found');
		}
	});
}

exports.validatePasswordKey = function(passKey, ipAddress, callback)
{
// ensure the passKey maps to the user's last recorded ip address //
	accounts.findOne({passKey:passKey, ip:ipAddress}, callback);
}

/*
	record insertion, update & deletion methods
*/

exports.addNewAccount = function (newData, callback)
{
	accounts.findOne({user:newData.user}, function(e, o) {
		if (o){
			callback('username-taken');
		}	else{
			accounts.findOne({email:newData.email}, function(e, o) {
				if (o){
					callback('email-taken');
				}	else{
					saltAndHash(newData.pass, function(hash){
						newData.pass = hash;
					// append date stamp when record was created //
						newData.date = moment().format('MMMM Do YYYY, h:mm:ss a');
						accounts.insertOne(newData, function(err,res) {
							if (err) throw err;
							// add balance to new user
							balance.insertOne({userId: newData._id, balance: parseInt(500)}, callback)
						});
					});
				}
			});
		}
	});
}

exports.updateAccount = function(newData, callback)
{
	let findOneAndUpdate = function(data){
		var o = {
			name : data.name,
			email : data.email,
			country : data.country
		}
		if (data.pass) o.pass = data.pass;
		accounts.findOneAndUpdate({_id:getObjectId(data.id)}, {$set:o}, {returnOriginal : false}, callback);
	}
	if (newData.pass == ''){
		findOneAndUpdate(newData);
	}	else { 
		saltAndHash(newData.pass, function(hash){
			newData.pass = hash;
			findOneAndUpdate(newData);
		});
	}
}

exports.updatePassword = function(passKey, newPass, callback)
{
	saltAndHash(newPass, function(hash){
		newPass = hash;
		accounts.findOneAndUpdate({passKey:passKey}, {$set:{pass:newPass}, $unset:{passKey:''}}, {returnOriginal : false}, callback);
	});
}

/*
	account lookup methods
*/

exports.getAllRecords = function(callback)
{
	accounts.find().toArray(
		function(e, res) {
		if (e) callback(e)
		else callback(null, res)
	});
}

exports.deleteAccount = function(id, callback)
{
	accounts.deleteOne({_id: getObjectId(id)}, callback);
}

exports.deleteAllAccounts = function(callback)
{
	accounts.deleteMany({}, callback);
}

exports.myBlance = function(id, callback) 
{
	balance.findOne({userId: getObjectId(`${id}`)}, function(err, res) {
		if (err) throw err;
		let balance = res.balance
		callback(null, balance)
	})
}
exports.sendPoints = async function(from, to, amt, callback )
{
	if ( from.email == to) {
		return callback('to-self')
	}
	let user = await balance.findOne({userId: getObjectId(from._id)})
	if(user.balance < amt) {
	   return callback('not-points')
	}
	let sendTo = await accounts.findOne({email: to});
	if(!sendTo) {
		return callback('not-found')
	}

	await balance.findOneAndUpdate({userId: getObjectId(sendTo._id)}, {$inc:{balance: parseInt(amt) }},async function(err, res) {
		if (err) 
		{
			return callback(err)
		}
		else {
			await balance.findOneAndUpdate({userId: getObjectId(from._id)}, {$inc:{balance: -parseInt(amt) }}, {returnOriginal: false}, function(err, res) {
				if (err) 
				{
					return callback(err)
				}
				recorder.insertOne({from: user.userId, to: sendTo._id, amount: parseInt(amt), date:new Date(Date.now())})
				callback(null, res.value.balance)
			})
		}
	})
}


exports.myTransactions = async function(user, callback) {
	var result = await recorder.aggregate([
        {$match : { 
			$or: [
				{from : getObjectId(user._id)},
				{to : getObjectId(user._id)}
			]
		 }},
		{ $lookup: {from: "accounts",localField: "to", foreignField: "_id",as: "sendTo"}},
		{ $lookup: { from: "accounts",localField: "from", foreignField: "_id", as: "gotFrom"}},
		{ $project: { _id: 1 , amount: 1, date: 1, 'sendTo.name': 1, 'sendTo._id': 1, 'gotFrom.name': 1, 'gotFrom._id': 1  }},
		{ $sort: { date: -1 } },
   ]).toArray()

   callback(null, result)
}

/*
	private encryption & validation methods
*/

var generateSalt = function()
{
	var set = '0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ';
	var salt = '';
	for (var i = 0; i < 10; i++) {
		var p = Math.floor(Math.random() * set.length);
		salt += set[p];
	}
	return salt;
}

var md5 = function(str) {
	return crypto.createHash('md5').update(str).digest('hex');
}

var saltAndHash = function(pass, callback)
{
	var salt = generateSalt();
	callback(salt + md5(pass + salt));
}

var validatePassword = function(plainPass, hashedPass, callback)
{
	var salt = hashedPass.substr(0, 10);
	var validHash = salt + md5(plainPass + salt);
	callback(null, hashedPass === validHash);
}

var getObjectId = function(id)
{
	return new require('mongodb').ObjectID(id);
}

var listIndexes = function()
{
	accounts.indexes(null, function(e, indexes){
		for (var i = 0; i < indexes.length; i++) console.log('index:', i, indexes[i]);
	});
}

