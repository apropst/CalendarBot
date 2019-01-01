/*
To Do:
- Add Event deleting
- Add message validation
- Flesh out command list
- Apply 'AddEvent' message handling to all other commands where necessary

*/

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
		sql.prepare("CREATE TABLE eventregistration (id INTEGER PRIMARY KEY AUTOINCREMENT, userid TEXT, event TEXT);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_events_id ON events (id);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_users_id ON users (id);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_eventregistration_id ON eventregistration (id);").run();
		sql.pragma("synchronous = 1");
		sql.pragma("journal_mode = wal");
	}
	
	client.getEvent = sql.prepare("SELECT * FROM events WHERE name = ?");
	client.getEvents = sql.prepare("SELECT * FROM events");
	client.addEvent = sql.prepare("INSERT OR REPLACE INTO events (name, starttime, endtime) VALUES (@name, @starttime, @endtime);");
	client.getUser = sql.prepare("SELECT * FROM users WHERE userid = ?");
	client.addUser = sql.prepare("INSERT OR REPLACE INTO users (username, userid, timezone) VALUES (@username, @userid, @timezone);");
	client.getRegistration = sql.prepare("SELECT * FROM eventregistration WHERE userid = ?");
	client.addRegistration = sql.prepare("INSERT OR REPLACE INTO eventregistration (userid, event) VALUES (@userid, @event);");
});

client.on('message', message => {
	if (message.author.bot)
		return;
	
	if (!waitingForInput(message.author.id)) {
		if (message.content.toLowerCase() == '!register') {
			if (!userExists(message.author.id)) {
				var collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id);
				
				var queueObj = {
					userid: message.author.id,
					type: 'register',
					step: 1
				}
				
				messageQueue.push(queueObj);
				
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
					messageQueue = queueRemove(messageQueue, message.author.id);
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
			
					var queueObj = {
						userid: message.author.id,
						type: cmd,
						step: 1
					}
					
					messageQueue.push(queueObj);
					
					collector.on('collect', message => {
						if (message.content == 'ping') {
							message.channel.send('pong!');
							collector.stop();
						}
					});
					
					collector.on('end', (collection, reason) => {
						messageQueue = queueRemove(messageQueue, message.author.id);
					});
					break;
				
				case 'addevent':
					var collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id);
					
					var queueObj = {
						userid: message.author.id,
						type: cmd,
						step: 1,
						messages: []
					}
					
					messageQueue.push(queueObj);
					
					message.channel.send('<@'+ message.author.id + '> Okay. What is the name of your event?');
					
					collector.on('collect', message => {
						switch (getStep(message.author.id, 'addevent')) {
							case 1:
								queueAddMsg(message.author.id, 'addevent', message.content);
								messageQueue = queueIncrement(messageQueue, message.author.id, 'addevent');
								message.channel.send('<@'+ message.author.id + '> What time will your event start?');
								break;
								
							case 2:
								queueAddMsg(message.author.id, 'addevent', message.content);
								message.channel.send('<@'+ message.author.id + '> What time will your event end?');
								messageQueue = queueIncrement(messageQueue, message.author.id, 'addevent');
								break;
								
							case 3:
								queueAddMsg(message.author.id, 'addevent', message.content);
								collector.stop();
								break;
						}
					});
					
					collector.on('end', (collection, reason) => {
						var messages = queueGetMsgs(message.author.id, 'addevent');
						
						var newEvent = {
							name: messages[0],
							starttime: messages[1],
							endtime: messages[2]
						}
						
						client.addEvent.run(newEvent);
						
						messageQueue = queueRemove(messageQueue, message.author.id);
						
						message.channel.send('<@'+ message.author.id + '> Event \'' + newEvent.name + '\' added.');
					});
					
					break;
				
				case 'getevent':
					var collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id);
					
					var queueObj = {
						userid: message.author.id,
						type: cmd,
						step: 1
					}
					
					messageQueue.push(queueObj);
					
					message.channel.send('<@'+ message.author.id + '> Enter the name of the event you want to search for.');
					
					collector.on('collect', message => {
						switch (getStep(message.author.id, 'getevent')) {
							case 1:
								collector.stop();
								break;
						}
					});
					
					collector.on('end', (collection, reason) => {
						var eventResult = client.getEvent.get(collection.array()[0].content);
						
						messageQueue = queueRemove(messageQueue, message.author.id);
						
						if (typeof eventResult !== 'undefined') {
							message.channel.send('Event ID: ' + eventResult.id + '\nEvent Name: ' + eventResult.name + '\nEvent Start Time: ' + eventResult.starttime + '\nEvent End Time: ' + eventResult.endtime);
						} else {
							message.channel.send('No event found.');
						}
					});
					
					break;
					
				case 'getevents':
					var eventList = client.getEvents.all();
					
					for (var x = 0; x < eventList.length; x++) {
						message.channel.send('Event ID: ' + eventList[x].id + '\nEvent Name: ' + eventList[x].name + '\nEvent Start Time: ' + eventList[x].starttime + '\nEvent End Time: ' + eventList[x].endtime);
					}
					
					break;
				
				case 'whoami':
					var userData = client.getUser.get(message.author.id);
					message.channel.send('User ID: ' + userData.id + ' Username: ' + userData.username + ' Discord User ID: ' + userData.userid + ' Timezone: ' + userData.timezone);
					break;
				
			}
		}
	} /*else {
		message.channel.send('<@'+ message.author.id + '> I am currently waiting for you to complete the current setup!');
		return;
	}*/
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
		if (messageQueue[x].userid === id) {
			return true;
		}
	}
	
	return false;
}

function queueRemove(arr, value) {
	for (var x of arr) {
		if (x.userid === value) {
			arr.splice(x, 1);
		}
	}
	
	return arr;
}

function queueIncrement(arr, id, type) {
	for (var x = 0; x < arr.length; x++) {
		if (arr[x].userid === id && arr[x].type === type) {
			arr[x].step++;
		}
	}
	
	return arr;
}

function getStep(id, type) {
	for (var x of messageQueue) {
		if (x.userid === id && x.type === type) {
			return x.step;
		}
	}
	
	return 0;
}

function queueAddMsg(id, type, message) {
	for (var x = 0; x < messageQueue.length; x++) {
		if (messageQueue[x].userid === id && messageQueue[x].type === type) {
			messageQueue[x].messages.push(message);
		}
	}
}

function queueGetMsgs(id, type) {
	for (var x = 0; x < messageQueue.length; x++) {
		if (messageQueue[x].userid === id && messageQueue[x].type === type) {
			return messageQueue[x].messages;
		}
	}
}