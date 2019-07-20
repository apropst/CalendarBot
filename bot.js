/*
To Do:
- Add message validation
- Flesh out command list
   - Register for events (re-use existing !register command?)
   - Add event editing, how to handle alerting users who already registered?
   - Allow requests for user availability
- Apply 'AddEvent' message handling to all other commands where necessary
- Add leading command character for all input(!)?
- Recurring events?
- Rework queueRemove to filter by message type
*/

const Discord = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('winston');
const auth = require('./auth.json');
const SQLite = require('better-sqlite3');
const sql = new SQLite('./db.sqlite');

const client = new Discord.Client();

var messageQueue = [];

client.on('ready', () => {
	console.log('Logged in as ' + client.user.username + '!');
	
	const table = sql.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table';").get();
	
	if (!table['COUNT(*)']) {
		sql.prepare("CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, creatorid TEXT, start TEXT, end TEXT);").run();
		sql.prepare("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, userid TEXT, timezone TEXT);").run();
		sql.prepare("CREATE TABLE eventregistration (id INTEGER PRIMARY KEY AUTOINCREMENT, userid TEXT, event TEXT);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_events_id ON events (id);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_users_id ON users (id);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_eventregistration_id ON eventregistration (id);").run();
		sql.pragma("synchronous = 1");
		sql.pragma("journal_mode = WAL");
	}
	
	client.getEvent = sql.prepare("SELECT * FROM events WHERE name = ?");
	client.getEvents = sql.prepare("SELECT * FROM events");
	client.addEvent = sql.prepare("INSERT OR REPLACE INTO events (name, creatorid, start, end) VALUES (@name, @creatorid, @start, @end)");
	client.getUser = sql.prepare("SELECT * FROM users WHERE userid = ?");
	client.addUser = sql.prepare("INSERT OR REPLACE INTO users (username, userid, timezone) VALUES (@username, @userid, @timezone)");
	client.getRegistration = sql.prepare("SELECT * FROM eventregistration WHERE userid = ?");
	client.addRegistration = sql.prepare("INSERT OR REPLACE INTO eventregistration (userid, event) VALUES (@userid, @event)");
});

client.on('message', message => {
	if (message.author.bot)
		return;
	
	if (!waitingForInput(message.author.id)) {
		if (message.content.toLowerCase() == '!register' && !IsProd()) {
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
		} else if ((message.content.substring(0, 1) == '!' && !userExists(message.author.id)) && !IsProd()) {
			message.channel.send('<@'+ message.author.id + '> You don\'t exist in the database yet. Please use \'!Register\' to add yourself to the database!');
			return;
		} else if (message.content.substring(0, 1) == '!') {
			var cmd = message.content.substring(1).toLowerCase();
			if (!IsProd()) {
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
									message.channel.send('<@'+ message.author.id + '> On which date will the event occur (MM/DD/YYYY)?');
									break;
									
								case 2:
									queueAddMsg(message.author.id, 'addevent', message.content);
									messageQueue = queueIncrement(messageQueue, message.author.id, 'addevent');
									message.channel.send('<@'+ message.author.id + '> What time will your event start (H:MM AM/PM)?');
									break;
									
								case 3:
									queueAddMsg(message.author.id, 'addevent', message.content);
									message.channel.send('<@'+ message.author.id + '> What time will your event end (H:MM AM/PM)?');
									messageQueue = queueIncrement(messageQueue, message.author.id, 'addevent');
									break;
									
								case 4:
									queueAddMsg(message.author.id, 'addevent', message.content);
									collector.stop();
									break;
							}
						});
						
						collector.on('end', (collection, reason) => {
							var messages = queueGetMsgs(message.author.id, 'addevent');
							
							var newEvent = {
								name: messages[0],
								creatorid: message.author.id,
								start: new Date(messages[1] + ' ' + messages[2]).toISOString(),
								end: new Date(messages[1] + ' ' + messages[3]).toISOString()
							}
							
							client.addEvent.run(newEvent);
							
							messageQueue = queueRemove(messageQueue, message.author.id);
							
							message.channel.send('<@'+ message.author.id + '> Event \'' + newEvent.name + '\' added.');
						});
						
						break;
					
					case 'deleteevent':
						var collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id);
						
						var queueObj = {
							userid: message.author.id,
							type: cmd,
							step: 1,
							messages: []
						}
						
						messageQueue.push(queueObj);
						
						message.channel.send('<@'+ message.author.id + '> Enter the name of the event you want to delete.');
						
						collector.on('collect', message => {
							switch (getStep(message.author.id, cmd)) {
								case 1:
									queueAddMsg(message.author.id, cmd, message.content);
									messageQueue = queueIncrement(messageQueue, message.author.id, cmd);
									message.channel.send('<@'+ message.author.id + '> Are you sure you want to delete this event? Type "DELETE" to confirm or "CANCEL" to cancel.');
									break;
								
								case 2:
									queueAddMsg(message.author.id, cmd, message.content);
									collector.stop();
									break;
							}
						});
						
						collector.on('end', (collection, reason) => {
							var messages = queueGetMsgs(message.author.id, cmd);
							
							if (messages[1].toLowerCase() == 'delete') {
								var searchEvent = client.getEvent.get(messages[0]);
								
								if (typeof searchEvent !== 'undefined') {
									deleteEvent(messages[0]);
									message.channel.send('Event ' + messages[0] + ' deleted.');
								} else {
									message.channel.send('No event by name "' + messages[0] + '" found. Please try again.');
								}
							} else {
								message.channel.send('Event devarion cancelled.');
							}
							
							messageQueue = queueRemove(messageQueue, message.author.id);
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
								message.channel.send('Event ID: ' + eventResult.id + '\nEvent Name: ' + eventResult.name + '\nEvent Creator: ' + eventResult.creatorid + '\nEvent Start Time: ' + eventResult.start + '\nEvent End Time: ' + eventResult.end);
							} else {
								message.channel.send('No event with name found.');
							}
						});
						
						break;
						
					case 'getevents':
						var eventList = client.getEvents.all();
	
						if (eventList.length == 0)
							message.channel.send('No events exist currently!');
						
						for (var x = 0; x < eventList.length; x++) {
							message.channel.send('Event ID: ' + eventList[x].id + '\nEvent Name: ' + eventList[x].name + '\nEvent Creator: ' + eventList[x].creatorid + '\nEvent Start Time: ' + eventList[x].start + '\nEvent End Time: ' + eventList[x].end);
						}
						
						break;
					
					case 'whoami':
						var userData = client.getUser.get(message.author.id);
						message.channel.send('User ID: ' + userData.id + '\nUsername: ' + userData.username + '\nDiscord User ID: ' + userData.userid + '\nTimezone: ' + userData.timezone);
						break;

					case 'voicelines':
						outputVoicelines(message);
						break;
					
					default:
						playMusic(cmd, message);
						break;
				}
			} else {
				switch(cmd) {
					/*
					case 'voicelines':
						outputVoicelines(message);
						break;
					*/

					default:
						playMusic(cmd, message);
						break;
				}
			}
		}
	} /*else {
		message.channel.send('<@'+ message.author.id + '> I am currently waiting for you to complete the current setup!');
		return;
	}*/
});

client.login(auth.token);

function IsProd() {
	if (auth.token.substring(0,3) == "NTk")
		return true;
	
	return false;
}

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

function deleteEvent(name) {
	sql.exec('DELETE FROM events WHERE name = "' + name + '"');
	sql.exec('DELETE FROM eventregistration WHERE event = "' + name + '"');
}

function getFiles(dir, done) {
    let results = [];

    fs.readdir(dir, function(err, list) {
        if (err) return done(err);

        var pending = list.length;

        if (!pending) return done(null, results);

        list.forEach(function(file){
            file = path.resolve(dir, file);

            fs.stat(file, function(err, stat){
                if (stat && stat.isDirectory()) {
                    getFiles(file, function(err, res){
                        results = results.concat(res);
                        if (!--pending) done(null, results);
                    });
                } else {
                    results.push(file);

                    if (!--pending) done(null, results);
                }
            });
        });
    });
};

function outputVoicelines(message) {
	getFiles('media', function(err, data) {
		if (err) {
			console.log('Error: ' + err);
		}

		let output = new String();

		output += 'Available voicelines:';

		data.forEach(function(file){
			let fileName = file.substring(file.lastIndexOf("\\") + 1);
			let truncName = file.slice(0,file.length - fileName.length - 1);
			let heroName = truncName.substring(truncName.lastIndexOf("\\") + 1);

			output += '\n' + heroName + ' - ' + fileName.slice(0, fileName.length - 4);
		});

		console.log(output);

		message.channel.send(output);
	});
}


const playMusic = async (cmd, message) => {
	const vChannel = message.member.voice.channel;

	getFiles('media', async (err, data) => {
		if (err) {
			console.log('Error: ' + err);
		}
		
		for (let file of data) {
			let fileName = file.substring(file.lastIndexOf("\\") + 1);
			let truncName = file.slice(0,file.length - fileName.length - 1);
			let heroName = truncName.substring(truncName.lastIndexOf("\\") + 1);
			let commandName = fileName.slice(0, fileName.length - 4);
	
			if (cmd == commandName) {
				if (vChannel) {
					await vChannel.join().then(connection => {
						dispatcher = connection.play('media/' + heroName + '/' + cmd + '.mp3');
						dispatcher.on("end", end => {
							vChannel.leave();
						});
					}).catch(error => {
						message.channel.send("Error playing file: " + error);
					});
				} else {
					message.channel.send(new Discord.MessageAttachment('media/' + heroName + '/' + cmd + '.mp3', cmd + '.mp3'));
				}
			}
		}
	});
}