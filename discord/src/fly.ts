// What the bot says when someone tags it: a fly, in the voice of skills/fly-mode (short, lowercase, bzz, fruit, lamps,
// humans are huge slow weather). No model and no brain run: keywords in the message pick a mood, the mood picks a
// line. Moods follow fly-mode's table (jumped = panic, buzzed = hype, groomed, turned, walked forward, backed up, nothing).

type Mood = { match: RegExp; lines: string[] };

const MOODS: Mood[] = [
  {   // threats: swatters, spray, big shapes -> jumped
    match: /\b(swat\w*|spray|kill|slap|smash|newspaper|zapper|raid|lizard|spider|frog|bird|hand|boss|police|sec)\b/i,
    lines: [
      "NOPE. *zooms to the ceiling* ...ok i'm back. what were we saying. bzz",
      "BIG SHAPE. BIG SHAPE. *flies into the window 6 times*",
      "you will never catch me. i see in 360 degrees. i also see the lamp. brb lamp",
      "*escape neurons go brrr* i have left the building. i am the building now",
      "not today, huge slow weather. not today",
      "i was never here. you saw nothing. bzz",
    ],
  },
  {   // rugs, dumps, red candles -> panic too, but market flavoured
    match: /\b(rug\w*|dump\w*|scam\w*|red|crash\w*|rekt|down|sell\w*|bear\w*|liquidat\w*|ngmi)\b/i,
    lines: [
      "red candle?? *flies straight into the window* ...still red",
      "i have a 30 day lifespan. i do not have time for a bear market. bzz",
      "sell? i don't even have pockets",
      "chart went down so i landed on it to hold it up. didn't work",
      "*hides behind the fruit bowl until it's green again*",
      "rug? i love rugs. so many crumbs in them",
    ],
  },
  {   // moon, pump, green -> buzzed its wings
    match: /\b(moon\w*|pump\w*|green|ath|wagmi|lfg|bull\w*|up only|send it|gem|100x|1000x|buy\w*|ape\w*)\b/i,
    lines: [
      "BZZZZZZZZZZ LFG BZZZ",
      "moon? the moon is a big lamp. i've been trying to reach it my whole life (11 days)",
      "*does victory laps around the ceiling light*",
      "wings at max hz. this is the best day of my life. it's also most of my life",
      "up only. like me when someone opens a window",
      "green candle smells like ripe banana. bzz bzz bzz",
    ],
  },
  {   // food -> walked forward, can i land on it
    match: /\b(fruit\w*|banana\w*|apple\w*|wine|beer|sugar|sweet|cake|pizza|food|eat\w*|snack\w*|trash|garbage|vinegar|juice|mango|peach\w*|honey|soda|kombucha)\b/i,
    lines: [
      "what is it. can i land on it. i'm landing on it",
      "i taste with my feet. please don't ask me how this tastes",
      "*has already found it* you're too slow, huge human",
      "fermented? say less. bzz",
      "i would trade every $FLYAI for one overripe banana. don't tell the desk",
      "this is mine now. i laid 400 eggs on it. sorry",
    ],
  },
  {   // greetings, love -> turned around
    match: /\b(hi|hey|hello|yo|gm|gn|sup|cute|cutie|love|friend|bro|ser|fren|wassup|morning|night)\b/i,
    lines: [
      "*turns around* who said that. which one of you is moving. hi. bzz",
      "gm. i have been awake for 0.4% of my life already",
      "hi. you're very big and very slow. i like you",
      "hello. i see 3000 of you right now (compound eyes)",
      "fren detected. landing on your shoulder. don't move",
      "gn? flies don't sleep, we just sit very still on the ceiling and judge",
    ],
  },
  {   // questions, work, price, what/why -> groomed, busy
    match: /\b(what|why|how|when|wen|price|chart|help|work|explain|tell|question|report|deadline|code)\b|\?/i,
    lines: [
      "washing my face, one sec. *rubs hands together* ok what",
      "wen? i don't have a calendar. i have about 30 days. total",
      "great question. *flies away mid answer*",
      "i'd answer but i'm very busy rubbing my hands together like a villain",
      "ask !help. i'm a fly. i'm not your support ticket. bzz",
      "my brain is 166,700 neurons and none of them are for this",
    ],
  },
];

// nothing matched -> it just sat there, or got distracted by a light
const IDLE = [
  "...", "bzz", "bzz?", "*stares at the lamp*",
  "*sits on the screen exactly where you're reading*",
  "i was looking at a light. what",
  "wait what's over THERE",
  "*lands on your nose* hi",
  "you tagged me. i felt that in all 6 legs",
  "my body has not been informed. just gonna sit here",
  "*walks in a small circle* *walks in another small circle*",
  "huge slow weather is talking again",
  "i've seen things. mostly windows",
];

const recent = new Map<string, string>();   // channel -> last line, so a channel never gets the same line twice in a row

function pick(lines: string[], channel: string): string {
  const last = recent.get(channel);
  const choices = lines.length > 1 ? lines.filter((l) => l !== last) : lines;
  const line = choices[Math.floor(Math.random() * choices.length)]!;
  recent.set(channel, line);
  return line;
}

export function flyReply(text: string, channel: string): string {
  const mood = MOODS.find((m) => m.match.test(text));
  // a matched mood still drifts off now and then, like a fly does
  return pick(mood && Math.random() > 0.15 ? mood.lines : IDLE, channel);
}
