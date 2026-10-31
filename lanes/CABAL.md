# THE CABAL (owner 14:15; the AI interactions are the show)

Why: a judge decides from the VIDEO whether we are a finalist. They must see, in big text, four AIs conniving like
people: arguing, bickering, believing a lie from a named player, betraying each other at the vote. Among Us
discussion + vote is the reference. The current 3.5 s hunting phase and the small chat read as 1/10. Replace them.

## The scene (stage, every HUNTING phase, now 9 s; contract TIMING.huntingMs)
- Hard cut from the house to THE TABLE: top-down, an ominous round table in a dark room, one candle, the house map
  carved into the table with the six rooms and their live ghost counts. The four hunters sit at it (big portraits).
- One speaker at a time. Subtitle text is HUGE (>= 56 px at 1920x1080, max 2 lines, <= 70 chars), name tag in the
  hunter's colour, typewriter in, portrait leans in and lights up. 3-4 lines per beat (~2 s each).
- Whispers from the house: a wisp flies in to one hunter's ear: "kyle whispers: everyone's in the crypt." The
  audience can see the real counts, so the room KNOWS it is a lie (dramatic irony). Show it in big italic.
- Conviction meters: one per hunter, a needle/bar pointing at the room it leans to, 0-100. When a whisper sways
  it, the needle swings with a whoosh and a tag "swayed by kyle". (contract HunterState.conviction, swayedBy)
- The vote: each hunter slams a token onto a room on the table map (Among Us vote reveal: one by one, a beat
  each, then the two swept rooms burn). Then cut to the reveal in the house.
- Phones: when YOUR lie sways a hunter: "The Medium believes you." Big, +200. When your room is chosen: you see it
  coming on the table before the cut.

## Comedy rules for every line (no slop)
- Dramatic irony first: the funniest thing is an AI confidently believing a lie the room watched you tell.
- Characters with status games: the Exorcist is a tired professional on overtime who just wants to go home; the
  Medium believes every whisper and is proud of it; the Skeptic mocks the Medium and is always wrong anyway; the
  Priest is vain and talks about himself. They bicker, interrupt, form alliances, and betray them at the vote.
- Specific, never spooky-generic: name real players (lowercase guest names), real rooms, real counts, call back
  to earlier beats ("kyle lied to me in beat 1 and I will not be fooled again." then gets fooled).
- Short. One idea per line. No puns on boo/spooky, no "I sense a presence", no "let's dive in", no emoji, no
  exclamation spam, no all-caps.

## Agent Relay stays real
Each hunter is its own Relay agent with its own private memory: a whisper DMs ONE hunter (the-dead -> hunter),
only that hunter knows it until it repeats it at the table. Lines are real #hunt messages posted by that agent;
lean/conviction/votes are real typed actions applied by the referee. The stage reads the observer feed + snapshot.

## Timeline (hard)
- 14:40 every cabal lane done and proven in its own folder.
- 14:45 release 2.5 (L5) with all of it. 14:45-15:00 rehearsal + video capture with bots. 15:15 video cut.
