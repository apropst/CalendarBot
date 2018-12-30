var Discord = require('discord.js');
var logger = require('winston');
var auth = require('./auth.json');
var SQLite = require('better-sqlite3');
var sql = new SQLite('./db.sqlite');

var client = new Discord.Client();

var messageQueue = [];

client.on('ready', () => {
	console.log('Logged in as ' + client.user.username + '!');
	
	var table = sql.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table';").get();
	
	if (!table['COUNT(*)']) {
		sql.prepare("CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, starttime INTEGER, endtime INTEGER);").run();
		sql.prepare("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, userid TEXT, timezone TEXT);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_events_id ON events (id);").run();
		sql.pragma("synchronous = 1");
		sql.pragma("journal_mode = wal");
	}
	
	client.getEvent = sql.prepare("SELECT * FROM events WHERE name = ?");
	client.addEvent = sql.prepare("INSERT OR REPLACE INTO events (name, starttime, endtime) VALUES (@name, @starttime, @endtime);");
	client.getUser = sql.prepare("SELECT * FROM users WHERE userid = ?");
	client.addUser = sql.prepare("INSERT OR REPLACE INTO users (username, userid, timezone) VALUES (@username, @userid, @timezone);");
});

client.on('message', message => {
	if (message.author.bot)
		return;
	
	if (!waitingForInput(message.author.id)) {
		if (message.content.toLowerCase() == '!register') {
			if (!userExists(message.author.id)) {
				var collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id);
				
				messageQueue.push(message.author.id);
				
				message.channel.send('<@'+ message.author.id + '> Please provide your timezone (Eastern, Central, Mountain, Pacific).');
			
				collector.on('collect', message => {
					if (message.content.toLowerCase() == 'eastern' || message.content.toLowerCase() == 'central' || message.content.toLowerCase() == 'mountain' || message.content.toLowerCase() == 'pacific') {
						var newUser = {
							username: message.author.username,
							userid: message.author.id,
							timezone: message.content.toLowerCase().charAt(0).toUpperCase() + message.content.toLowerCase().slice(1)
						}
						client.addUser.run(newUser);
						message.channel.send('<@'+ message.author.id + '> You\'ve been added to the database!');
						collector.stop();
					} else if (message.content.toLowerCase() == '!cancel') {
						collector.stop();
					} else {
						message.channel.send('<@'+ message.author.id + '> That isn\'t a valid option. Please try again or type \'!Cancel\' to stop.');
					}
				});
				
				collector.on('end', (collection, reason) => {
					messageQueue = arrRemove(messageQueue, message.author.id);
				});
			} else {
				message.channel.send('<@'+ message.author.id + '> You\'re already in the database!');
				return;
			}
		} else if (message.content.substring(0, 1) == '!' && !userExists(message.author.id)) {
			message.channel.send('<@'+ message.author.id + '> You don\'t exist in the database yet. Please use \'!Register\' to add yourself to the database!');
			return;
		} else if (message.content.substring(0, 1) == '!') {
			var cmd = message.content.substring(1).toLowerCase();
			
			switch(cmd) {
				case 'ping':
					message.channel.send('<@'+ message.author.id + '> Pong! ' + message.author.username + ' ' + message.author.id);
					
					var collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id);
			
					messageQueue.push(message.author.id);
					
					collector.on('collect', message => {
						if (message.content == 'ping') {
							message.channel.send('pong!');
							collector.stop();
						}
					});
					
					collector.on('end', (collection, reason) => {
						messageQueue = arrRemove(messageQueue, message.author.id);
					});
					break;
				
				case 'addevent':
					if (arg1 != "" && arg2 != "" && arg3 != "") {
						var newEvent = {
							name: arg1,
							starttime: arg2,
							endtime: arg3
						}
						client.addEvent.run(newEvent);
					}
					break;
				
				case 'getevent':
					if (arg1 != "") {
						var eventdata = client.getEvent.get(arg1);
						message.channel.send('Event ID: ' + eventdata.id + ' Event Name: ' + eventdata.name + ' Event Start Time: ' + eventdata.starttime + ' Event End Time: ' + eventdata.endtime);
					}
					break;
				
				case 'whoami':
					var userData = client.getUser.get(message.author.id);
					message.channel.send('User ID: ' + userData.id + ' Username: ' + userData.username + ' Discord User ID: ' + userData.userid + ' Timezone: ' + userData.timezone);
					break;
				
			}
		}
	} else {
		message.channel.send('<@'+ message.author.id + '> I am currently waiting for you to complete the current setup!');
		return;
	}
});

client.login(auth.token);

function userExists(id) {
	if (client.getUser.get(id) == null)
		return false;
	else
		return true;
}

function waitingForInput(id) {
	for (var x = 0; x < messageQueue.length; x++) {
		if (messageQueue[x] === id) {
			return true;
		}
	}
	
	return false;
}

function arrRemove(arr, value) {
	for (var x = 0; x < arr.length; x++) {
		if (arr[x] === value) {
			arr.splice(x, 1);
		}
	}
	
	return arr;
}