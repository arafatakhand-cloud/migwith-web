// 📜 The extra fun / social room commands (the app's RoomCommands.kt) and the
// full list shown on the room's Command page. Generated from the app's file so
// web and app users see identical lines.

export const EXTRA_SOCIAL: Record<string, (u: string, t: string) => string> = {
  "/agree": (u, t) => `${u} agrees with ${t}! 👍`,
  "/argh": (u) => `${u} goes ARGHHH! 😫`,
  "/ball": (u, t) => `${u} throws a ball at ${t}! 🏐`,
  "/bark": (u, t) => `${u} barks at ${t}! 🐶 Woof woof!`,
  "/bearhug": (u, t) => `${u} gives ${t} a big bear hug! 🐻🤗`,
  "/beer": (u, t) => `${u} offers ${t} a cold drink! 🍺`,
  "/beggar": (u, t) => `${u} begs ${t} for some coins! 🥺🪙`,
  "/behave": (u, t) => `${u} tells ${t} to behave! ☝️`,
  "/bid": (u, t) => `${u} places a bid on ${t}! 💸`,
  "/bite": (u, t) => `${u} playfully bites ${t}! 😬`,
  "/bless": (u, t) => `${u} blesses ${t}! 🙏✨`,
  "/blowk": (u, t) => `${u} blows a kiss to ${t}! 😘`,
  "/bored": (u) => `${u} is sooo bored... 😑`,
  "/bow": (u, t) => `${u} bows down to ${t}! 🙇`,
  "/caff": (u) => `${u} needs caffeine NOW! ☕⚡`,
  "/chicken": (u, t) => `${u} calls ${t} a chicken! 🐔 Bawk bawk!`,
  "/choking": (u, t) => `${u} is choking with laughter at ${t}! 🤣`,
  "/comfort": (u, t) => `${u} comforts ${t}. It'll be okay 🤍`,
  "/confuse": (u, t) => `${u} is totally confused by ${t}! 😵‍💫`,
  "/dhivehi": (u, t) => `${u} greets ${t} the Dhivehi way: Kihineh? 🇲🇻`,
  "/disagree": (u, t) => `${u} disagrees with ${t}! 👎`,
  "/doh": (u) => `${u} goes D'OH! 🤦`,
  "/don": (u) => `${u} walks in like a DON! 😎`,
  "/drool": (u, t) => `${u} drools over ${t}! 🤤`,
  "/drunk": (u) => `${u} is dizzy and wobbly! 🥴`,
  "/duck": (u, t) => `${u} ducks to hide from ${t}! 🦆`,
  "/eh": (u) => `${u} says: Eh? 🤨`,
  "/eid": (u, t) => `${u} wishes ${t} Eid Mubarak! 🌙✨`,
  "/embrace": (u, t) => `${u} embraces ${t} warmly! 🫂`,
  "/faint": (u) => `${u} faints! 😵`,
  "/fart": (u, t) => `${u} lets one rip near ${t}! 💨😂`,
  "/flirt": (u, t) => `${u} flirts with ${t}! 😉💕`,
  "/fly": (u) => `${u} flies away like a bird! 🕊️`,
  "/football": (u, t) => `${u} passes the football to ${t}! ⚽`,
  "/french": (u, t) => `${u} says to ${t}: Bonjour! 🇫🇷🥖`,
  "/frown": (u, t) => `${u} frowns at ${t}! ☹️`,
  "/gaan": (u, t) => `${u} sings a gaan for ${t}! 🎶`,
  "/garba": (u, t) => `${u} dances garba with ${t}! 💃🪔`,
  "/gee": (u) => `${u} says: Gee whiz! 😮`,
  "/geet": (u, t) => `${u} sings a geet for ${t}! 🎵`,
  "/getmyluck": (u) => `${u} rubs the lucky charm — come on luck! 🍀🎲`,
  "/giggle": (u, t) => `${u} giggles at ${t}! 🤭`,
  "/git": (u, t) => `${u} tells ${t}: Git outta here! 😤`,
  "/greet": (u, t) => `${u} greets ${t}! 🙋`,
  "/grin": (u, t) => `${u} grins at ${t}! 😁`,
  "/gyanu": (u, t) => `${u} shares some wisdom with ${t}! 🧠📚`,
  "/happy": (u) => `${u} is super happy! 😄`,
  "/harubas": (u, t) => `${u} sends harubas (best wishes) to ${t}! 🌺`,
  "/headache": (u) => `${u} has a headache! 🤕`,
  "/hmm": (u) => `${u} goes hmmm... 🤔`,
  "/honor": (u, t) => `${u} honors ${t}! 🎖️`,
  "/hospital": (u, t) => `${u} sends ${t} to the hospital! 🏥😂`,
  "/hum": (u, t) => `${u} hums a tune for ${t}! 🎶`,
  "/hungry": (u) => `${u} is hungry! 🍔🍕`,
  "/ice": (u, t) => `${u} throws ice at ${t}! 🧊`,
  "/jungle": (u, t) => `${u} drags ${t} into the jungle! 🌴🐒`,
  "/karate": (u, t) => `${u} karate-chops ${t}! 🥋 HI-YAH!`,
  "/koba": (u, t) => `${u} asks ${t}: Koba? (where?) 👀`,
  "/lag": (u) => `${u} is laaaggging... 🐌📶`,
  "/listen": (u, t) => `${u} listens closely to ${t}! 👂`,
  "/loser": (u, t) => `${u} calls ${t} a loser! 🫵😜`,
  "/lovekill": (u, t) => `${u} kills ${t} with love! 💘`,
  "/martian": (u) => `${u} beams down like a Martian! 👽🛸`,
  "/massage": (u, t) => `${u} gives ${t} a relaxing massage! 💆`,
  "/miss": (u, t) => `${u} misses ${t}! 🥺`,
  "/mmm": (u) => `${u} goes mmm... yummy! 😋`,
  "/moo": (u, t) => `${u} moos at ${t}! 🐄`,
  "/mumble": (u, t) => `${u} mumbles something to ${t}... 🤐`,
  "/mvsong": (u, t) => `${u} sings a Maldivian song for ${t}! 🏝️🎶`,
  "/nod": (u, t) => `${u} nods at ${t}! 🙂‍↕️`,
  "/paint": (u, t) => `${u} paints a picture of ${t}! 🎨`,
  "/parkfees": (u, t) => `${u} asks ${t} to pay the park fees! 🅿️💰`,
  "/phew": (u) => `${u} goes PHEW! 😮‍💨`,
  "/pinch": (u, t) => `${u} pinches ${t}! 🤏`,
  "/power": (u) => `${u} powers up! ⚡💪`,
  "/propose": (u, t) => `${u} gets down on one knee and proposes to ${t}! 💍`,
  "/puke": (u) => `${u} feels sick! 🤢`,
  "/punch": (u, t) => `${u} punches ${t}! 👊`,
  "/purr": (u, t) => `${u} purrs at ${t}! 🐱`,
  "/pushpa": (u, t) => `${u} tells ${t}: Pushpa... jhukega nahi! 😎🔥`,
  "/relax": (u, t) => `${u} tells ${t} to relax! 😌`,
  "/ruffle": (u, t) => `${u} ruffles ${t}'s hair! 💇`,
  "/sad": (u) => `${u} is feeling sad... 😢`,
  "/salam": (u, t) => `${u} says Assalamu Alaikum to ${t}! 🤲`,
  "/salute": (u, t) => `${u} salutes ${t}! 🫡`,
  "/scream": (u, t) => `${u} screams at ${t}! 😱`,
  "/seduce": (u, t) => `${u} tries to charm ${t}! 😏🌹`,
  "/shiver": (u) => `${u} shivers! 🥶`,
  "/shmoo": (u, t) => `${u} shmoos ${t}! 🫠`,
  "/shy": (u) => `${u} is feeling shy! 🙈`,
  "/sick": (u) => `${u} is feeling sick! 🤒`,
  "/sigh": (u) => `${u} sighs... 😔`,
  "/smirk": (u, t) => `${u} smirks at ${t}! 😏`,
  "/smoke": (u) => `${u} blows smoke rings! 💨`,
  "/sneeze": (u, t) => `${u} sneezes on ${t}! 🤧 Achoo!`,
  "/snore": (u) => `${u} is snoring! 😴 Zzz...`,
  "/spit": (u, t) => `${u} spits out the drink laughing at ${t}! 💦😂`,
  "/spock": (u, t) => `${u} does the Vulcan salute to ${t}! 🖖`,
  "/squirt": (u, t) => `${u} squirts water at ${t}! 🔫💦`,
  "/stare": (u, t) => `${u} stares at ${t}! 👀`,
  "/tantrum": (u) => `${u} throws a tantrum! 😤`,
  "/tpyo": (u) => `${u} made a typo! 🙊`,
  "/typo": (u) => `${u} made a typo! 🙊`,
  "/trimmer": (u, t) => `${u} trims ${t}'s beard! ✂️🧔`,
  "/weed": (u) => `${u} pulls weeds in the garden! 🌿`,
  "/whackit": (u, t) => `${u} whacks ${t}! 🔨`,
  "/whiskey": (u, t) => `${u} pours a drink for ${t}! 🥃`,
  "/whistle": (u, t) => `${u} whistles at ${t}! 😗🎶`,
  "/whop": (u, t) => `${u} whops ${t}! 💥`,
  "/worthy": (u, t) => `${u} bows: I'm not worthy, ${t}! 🙇`,
  "/ws": (u, t) => `${u} says: Wassup ${t}! ✌️`,
  "/yawn": (u) => `${u} yawns! 🥱`,
  "/yeah": (u) => `${u} shouts YEAH! 🙌`,
  "/tc": (u, t) => `${u} says take care, ${t}! Stay safe 💙`,
  "/takecare": (u, t) => `${u} says take care, ${t}! Stay safe 💙`,
};

// Short original verses for the /poetry… commands.
const POETRY: Record<string, string[]> = {
  "/poetrybangla": [
    "আকাশ জুড়ে মেঘের ভেলা, মনটা আজ খুশির খেলা 🌧️",
    "নদীর ধারে কাশফুল দোলে, তোমার কথা মনে পড়ে চলে 🌾",
    "চাঁদের আলোয় ভিজল রাত, রইল শুধু তোমার হাত 🌙",
    "বৃষ্টি নামে টিনের চালে, গল্প জমে চায়ের কাপে ☕"
  ],
  "/poetryhindi": [
    "Chaand ki roshni mein, tera naam likha hai 🌙",
    "Dosti ki raah pe, har pal naya mila hai 🤝",
    "Baarish ki boondon mein, yaadon ka mela hai 🌧️"
  ],
  "/poetrynepal": [
    "Himalko kakhma ghaam chhaayo, mann mero ramaayo 🏔️",
    "Phoolko baasna jasto, saathi timi mitho 🌸"
  ],
  "/poetryfilipino": [
    "Sa ilalim ng buwan, ikaw ang aking kaibigan 🌙",
    "Ngiti mo'y araw, sa umagang malamig ☀️"
  ],
  "/poetrymv": [
    "Blue lagoon, soft sand — life is calm in Maldive land 🏝️",
    "Waves whisper slow, where the island breezes blow 🌊"
  ],
  "/poetryfootball": [
    "Ninety minutes, one round ball — the whole world stops to watch it all ⚽",
    "Pass and run and shoot and score, the crowd is roaring more and more 🥅",
    "Win or lose, we sing the song, our team is where our hearts belong 🏟️"
  ]
};

/** The line for one of the extra commands, or null if it isn't one. */
export function extraSocialMessage(command: string, me: string, target: string): string | null {
  const verses = POETRY[command];
  if (verses) return `${me} recites: ${verses[Math.floor(Math.random() * verses.length)]}`;
  const f = EXTRA_SOCIAL[command];
  return f ? f(me, target) : null;
}

// Every command on the Command page (old + new), A → Z.
const BASE_ROOM_COMMANDS = ["/afk", "/angry", "/away", "/back", "/beibei", "/bestie", "/birthday", "/blush", "/boo", "/bro", "/brb", "/busy", "/bye", "/cake", "/challenge", "/champion", "/checktag", "/cheer", "/cheers", "/chocolate", "/clap", "/coffee", "/crown", "/cry", "/cuddle", "/dance", "/diamond", "/8ball", "/flower", "/fortune", "/freekick", "/frenzy", "/friend", "/ga", "/ge", "/gl", "/gm", "/gn", "/go", "/goal", "/gold", "/goodafternoon", "/goodevening", "/goodmorning", "/goodnight", "/handball", "/hbd", "/heart", "/hello", "/hfive", "/hi", "/highfive", "/hold", "/huanhuan", "/hug", "/jingjing", "/jump", "/kiss", "/laugh", "/lose", "/love", "/luck", "/me", "/medal", "/nini", "/offside", "/online", "/pat", "/penalty", "/poke", "/present", "/proud", "/record", "/red", "/respect", "/ring", "/roll", "/rose", "/run", "/scare", "/sing", "/sis", "/slap", "/sleep", "/smile", "/sorry", "/surprise", "/taunt", "/teddy", "/thanks", "/tickle", "/torch", "/ty", "/wave", "/wb", "/welcome", "/welcomeall", "/whois", "/win", "/winner", "/wink", "/yellow", "/yingying"];
const EXTRA_SOCIAL_COMMANDS = ["/agree", "/argh", "/ball", "/bark", "/bearhug", "/beer", "/beggar", "/behave", "/bid", "/bite", "/bless", "/blowk", "/bored", "/bow", "/caff", "/chicken", "/choking", "/comfort", "/confuse", "/dhivehi", "/disagree", "/doh", "/don", "/drool", "/drunk", "/duck", "/eh", "/eid", "/embrace", "/faint", "/fart", "/flirt", "/fly", "/football", "/french", "/frown", "/gaan", "/garba", "/gee", "/geet", "/getmyluck", "/giggle", "/git", "/greet", "/grin", "/gyanu", "/happy", "/harubas", "/headache", "/hmm", "/honor", "/hospital", "/hum", "/hungry", "/ice", "/jungle", "/karate", "/koba", "/lag", "/listen", "/loser", "/lovekill", "/martian", "/massage", "/miss", "/mmm", "/moo", "/mumble", "/mvsong", "/nod", "/paint", "/parkfees", "/phew", "/pinch", "/poetrybangla", "/poetryfilipino", "/poetryfootball", "/poetryhindi", "/poetrymv", "/poetrynepal", "/power", "/propose", "/puke", "/punch", "/purr", "/pushpa", "/relax", "/ruffle", "/sad", "/salam", "/salute", "/scream", "/seduce", "/shiver", "/shmoo", "/shy", "/sick", "/sigh", "/smirk", "/smoke", "/sneeze", "/snore", "/spit", "/spock", "/squirt", "/stare", "/tantrum", "/tpyo", "/trimmer", "/typo", "/weed", "/whackit", "/whiskey", "/whistle", "/whop", "/worthy", "/ws", "/yawn", "/yeah", "/tc", "/takecare"];
// Park commands shown on the Command page (handled by the room page, not social).
const PARK_COMMANDS = ["/park", "/unpark"];
export const ALL_ROOM_COMMANDS: string[] = Array.from(new Set([...BASE_ROOM_COMMANDS, ...EXTRA_SOCIAL_COMMANDS, ...PARK_COMMANDS])).sort();
