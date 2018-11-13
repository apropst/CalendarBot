var Discord = require('discord.js');
var logger = require('winston');
var auth = require('./auth.json');
var SQLite = require('better-sqlite3');
var sql = new SQLite('./db.sqlite');

var client = new Discord.Client();

client.on('ready', () => {
    console.log('Logged in as ' + client.user.username + '!');
	
	var table = sql.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table';").get();
	
	if (!table['COUNT(*)']) {
		sql.prepare("CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, starttime INTEGER, endtime INTEGER);").run();
		sql.prepare("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, userid TEXT, timezone TEXT);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_events_id ON events (id);").run();
		sql.pragma("synchronous = 1");
		sql.pragma("journal_mode = wal");
	}
	
	client.getEvent = sql.prepare("SELECT * FROM events WHERE name = ?");
	client.setEvent = sql.prepare("INSERT OR REPLACE INTO events (name, starttime, endtime) VALUES (@name, @starttime, @endtime);");
	client.getUser = sql.prepare("SELECT * FROM users WHERE userid = ?");
	client.setUser = sql.prepare("INSERT OR REPLACE INTO users (user, userid, timezone) VALUES (@user, @userid, @timezone);");
});

client.on('message', message => {
	if (message.author.id == client.id)
		return;
	
    if (message.content.substring(0, 1) == '!') {
        var args = message.content.substring(1).split(' ');
        var cmd = args[0];
		var arg1 = args[1];
		var arg2 = args[2];
		var arg3 = args[3];
		
        args = args.splice(1);
        switch(cmd) {
            case 'ping':
				message.channel.send('<@'+ message.author.id + '> Pong! ' + message.author.username + ' ' + message.author.id);
            break;
            
			case 'setevent':
				if (arg1 != "" && arg2 != "" && arg3 != "") {
					var newevent = {
						name: arg1,
						starttime: arg2,
						endtime: arg3
					}
					client.setEvent.run(newevent);
				}
			break;
			
			case 'getevent':
				if (arg1 != "") {
					var eventdata = client.getEvent.get(arg1);
					message.channel.send('Event ID: ' + eventdata.id + ' Event Name: ' + eventdata.name + ' Event Start Time: ' + eventdata.starttime + ' Event End Time: ' + eventdata.endtime);
				}
			break;
        }
		
		var collector = new Discord.MessageCollector(message.channel, m => m.author.id === message.author.id, { time: 10000 });
		console.log(collector);

		collector.on('collect', message => {
			if (message.content == 'ping') {
				message.channel.send('pong!');
			}
		});
	}
});

client.login(auth.token);