var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var SQLite = require('better-sqlite3');
var sql = new SQLite('./db.sqlite');

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
	
	var table = sql.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table';").get();
	
	if (!table['COUNT(*)']) {
		sql.prepare("CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, starttime INTEGER, endtime INTEGER);").run();
		sql.prepare("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, starttime INTEGER, endtime INTEGER);").run();
		sql.prepare("CREATE UNIQUE INDEX idx_events_id ON events (id);").run();
		sql.pragma("synchronous = 1");
		sql.pragma("journal_mode = wal");
	}
	
	bot.getEvent = sql.prepare("SELECT * FROM events WHERE name = ?");
	bot.setEvent = sql.prepare("INSERT OR REPLACE INTO events (name, starttime, endtime) VALUES (@name, @starttime, @endtime);");
});

bot.on('message', function (user, userID, channelID, message, evt) {
	// Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
		var arg1 = args[1];
		var arg2 = args[2];
		var arg3 = args[3];
       
        args = args.splice(1);
        switch(cmd) {
            // !ping
            case 'ping':
                bot.sendMessage({
                    to: channelID,
                    message: 'Pong!' + channelID
                });
            break;
            
			case 'setevent':
				if (arg1 != "" && arg2 != "" && arg3 != "") {
					var newevent = {
						name: arg1,
						starttime: arg2,
						endtime: arg3
					}
					bot.setEvent.run(newevent);
				}
			break;
			
			case 'getevent':
				if (arg1 != "") {
					var eventdata = bot.getEvent.get(arg1);
					bot.sendMessage({
						to: channelID,
						message: 'Event ID: ' + eventdata.id + ' Event Name: ' + eventdata.name + ' Event Start Time: ' + eventdata.starttime + ' Event End Time: ' + eventdata.endtime
					});
				}
			break;
         }
     }
});