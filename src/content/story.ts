// ============================================================================
// STORY CONTENT — every word on the page lives here.
// Edit text here; the sections pick it up automatically.
// ============================================================================

export type TextVariant = 'chars' | 'slide' | 'blur' | 'mask' | 'words' | 'scale' | 'rotate'
export type Side = 'left' | 'right' | 'center'

export interface Chapter {
  id: string
  /** short label shown in the eyebrow, e.g. "02" */
  num: string
  title: string
  /** giant outlined word drifting in the background layer */
  bgWord: string
  /** scroll length in viewport heights */
  height: number
  side: Side
  variant: TextVariant
  text?: string
}

export const chapters: Chapter[] = [
  {
    id: 'hero',
    num: '01',
    title: 'How I Fell in Love with MMA.',
    bgWord: 'UFC 317',
    height: 300,
    side: 'left',
    variant: 'chars',
  },
  {
    id: 'driveway',
    num: '02',
    title: 'The Driveway',
    bgWord: 'ARRIVAL',
    height: 330,
    side: 'left',
    variant: 'slide',
    text: 'My dad and I pulled into the driveway. The house was already packed — people upstairs in the living room glued to the TV, more people down in the basement. In the kitchen, in the middle of it all, there was food laid out, and we grabbed plates before heading down. That’s when I saw one of my best friends — I had no idea he’d be there. We ate, we sat down together, and the night started to feel electric before the card had even really gotten going.',
  },
  {
    id: 'basement',
    num: '03',
    title: 'The Basement',
    bgWord: 'BASEMENT',
    height: 330,
    side: 'right',
    variant: 'blur',
    text: 'Downstairs was a different world. It was full of older guys — sixteen, seventeen, all the way up into their twenties — crowded around the screen. I didn’t know anyone’s records, their styles, their names even. My friend and I just picked fighters off instinct, pointed at the screen and said ‘alright, let’s go with that guy.’ No stakes, no real knowledge — just two kids caught up in the energy of a room that was about to explode.',
  },
  {
    id: 'van',
    num: '04',
    title: 'Joshua Van',
    bgWord: 'VAN',
    height: 360,
    side: 'left',
    variant: 'mask',
    text: 'One name stuck with me that night: Joshua Van. It was the first time I’d ever seen him fight. He dropped his opponent, Brandon Royval, and followed him to the ground, unloading strikes. The whole room came alive. That’s when my dad reached over and covered my eyes — he didn’t want me seeing it up close. Van went on to win by decision in what people still call one of the best fights of the year.',
  },
  {
    id: 'storm',
    num: '05',
    title: 'The Storm',
    bgWord: 'STORM',
    height: 1100,
    side: 'center',
    variant: 'blur',
  },
  {
    id: 'quiet',
    num: '06',
    title: 'Quiet',
    bgWord: 'QUIET',
    height: 300,
    side: 'left',
    variant: 'words',
    text: 'With my dad’s hand over my eyes, I couldn’t see it, but I didn’t need to. I could feel it in the sound of the room — the gasp, then the roar. That one still second, heart still racing, was somehow louder than anything I actually saw.',
  },
  {
    id: 'sunset',
    num: '07',
    title: 'Two Ways to Win',
    bgWord: 'SUNSET',
    height: 340,
    side: 'right',
    variant: 'scale',
    text: 'Later that same night came the fight that really sealed it — Alexandre Pantoja, the champion, against Kai Kara-France. Pantoja took him down, worked him over on the ground, and in the third round locked in a choke until Kara-France had no choice but to tap. Two completely different fights, two completely different ways to win, and I was hooked on both.',
  },
  {
    id: 'cloud',
    num: '08',
    title: 'The Rabbit Hole',
    bgWord: 'RESEARCH',
    height: 300,
    side: 'left',
    variant: 'rotate',
    text: 'One night turned into hours of research. Fighters, records, styles — I couldn’t stop learning. I watched everything I could find: jiu-jitsu practitioners, Muay Thai fighters, breakdowns of fights move by move.',
  },
  {
    id: 'gym',
    num: '09',
    title: 'Walking Into the Gym',
    bgWord: 'THE GYM',
    height: 360,
    side: 'left',
    variant: 'chars',
    text: 'The first time I walked into the gym, I remember thinking, ‘holy cow, these guys know what they’re doing.’ I watched the Muay Thai guys — intermediate fighters who looked like they could handle themselves against anyone — and the jiu-jitsu guys, who clearly knew real technique. I had no idea how to defend myself. I figured they’d submit me in a couple of seconds. I wasn’t terrified, but I was nervous. I was brand new, and it showed.',
  },
  {
    id: 'mma',
    num: '10',
    title: 'Why It Stuck',
    bgWord: 'BROTHERHOOD',
    height: 400,
    side: 'right',
    variant: 'slide',
    text: 'MMA strengthens your mind as much as your body. It teaches focus, discipline, and self-defense. It builds real physical strength and sharper reflexes. But what keeps me coming back isn’t just the physical side — it’s the people. When you fight someone, you know them. There’s a brotherhood in it, a connection that forms the moment you’re in there together. It’s not about hurting anyone. It’s the thrill, the adrenaline, and what it teaches you about respect — because there will always be people who beat you, and you learn to treat them the way you want to be treated anyway.',
  },
  {
    id: 'foot',
    num: '11',
    title: 'The Broken Foot',
    bgWord: 'FRACTURE',
    height: 380,
    side: 'left',
    variant: 'mask',
    text: 'Training hard came with a cost. Between the constant kicking in Muay Thai and the pressure from grappling positions in jiu-jitsu, I developed a stress fracture in my foot. The pain started and I ignored it — kept sparring, kept training, told myself that was just pain tolerance. Two weeks later, my parents finally made me get it checked out. It turned out to be a real break. It didn’t make me love the sport any less. If anything, it made me more determined to come back stronger.',
  },
  {
    id: 'flow',
    num: '12',
    title: 'The Flow State',
    bgWord: 'FLOW',
    height: 360,
    side: 'right',
    variant: 'blur',
    text: 'Sparring with one of my closest friends, something switches. Time slows down. Every movement matters. My body moves before I’ve even finished the thought — controlling his arms, trapping his legs, reacting before I consciously decide to. It’s not thinking and then doing; it’s happening as I think it. The adrenaline, the focus, the total presence in that single moment — that’s the feeling I train for.',
  },
  {
    id: 'timeline',
    num: '13',
    title: 'Then to Now',
    bgWord: 'THEN → NOW',
    height: 800,
    side: 'center',
    variant: 'scale',
  },
  {
    id: 'now',
    num: '14',
    title: 'Now',
    bgWord: 'NOW',
    height: 330,
    side: 'center',
    variant: 'words',
    text: 'I didn’t expect a random night at a family friend’s house to change what I cared about. But it did. I’m still early in this — still learning, still training, still getting back up after setbacks — but I know exactly where it started: a packed basement, a friend I didn’t expect to see, and two fights I’ll never forget.',
  },
]

export const N = chapters.length
export const indexOf = (id: string) => chapters.findIndex((c) => c.id === id)

// ---- Hero ------------------------------------------------------------------
export const hero = {
  titleLines: ['How I Fell', 'in Love with', 'MMA.'],
  subhead: 'One fight. One night. Everything changed.',
  cue: 'Scroll to relive it.',
}

// ---- The Storm: drifting fragments + the key line ---------------------------
/** p0..p1 = local storm progress window (0..1) in which the fragment is visible. */
export const stormFragments = [
  { t: 'I didn’t know anyone’s records, their styles, their names even.', p0: 0.01, p1: 0.13, x: 6, y: 22, drift: 1 },
  { t: 'Just two kids caught up in the energy of a room.', p0: 0.09, p1: 0.2, x: 54, y: 62, drift: -1 },
  { t: 'Every fighter, every move — a language I didn’t speak yet.', p0: 0.15, p1: 0.27, x: 10, y: 70, drift: 1 },
  { t: 'Then a second fight. A different way to win.', p0: 0.24, p1: 0.36, x: 52, y: 20, drift: -1 },
  { t: 'Reaching for something solid.', p0: 0.32, p1: 0.43, x: 8, y: 30, drift: 1 },
  { t: 'Slipping. Trying again.', p0: 0.43, p1: 0.54, x: 58, y: 68, drift: -1 },
  { t: 'I was hooked on both.', p0: 0.52, p1: 0.62, x: 12, y: 60, drift: 1 },
]
export const stormKeyLine = {
  before: 'That’s what hit me, and I ',
  hot: 'fell in love',
  after: ' with mixed martial arts.',
  p0: 0.6,
  p1: 0.79,
}

// ---- Timeline --------------------------------------------------------------
export const milestones = [
  {
    when: 'June 28, 2025',
    title: 'UFC 317',
    body: 'A packed basement, Joshua Van’s ground-and-pound, Pantoja’s third-round submission.',
  },
  {
    when: 'Weeks later',
    title: 'The rabbit hole',
    body: 'Falling down the rabbit hole: fighters, fight breakdowns, techniques.',
  },
  {
    when: 'Recently',
    title: 'The first day',
    body: 'Started training jiu-jitsu and Muay Thai, walked into the gym nervous and new.',
  },
  {
    when: 'A setback',
    title: 'The break',
    body: 'A stress fracture from training hard, and coming back more determined than before.',
  },
  {
    when: 'Today',
    title: 'Still going',
    body: 'Still training, still learning, chasing that flow-state feeling every time I step on the mat.',
  },
]

/** Scroll progress (within the Timeline chapter) at which each milestone node is reached / lights up. */
export const milestoneP = [0.1, 0.3, 0.5, 0.7, 0.9]

// ---- Closing ---------------------------------------------------------------
export const closing = {
  cta: 'This is just the beginning.',
  /** [CONTACT PLACEHOLDER] — put your real contact / social link here (e.g. https://instagram.com/yourname or mailto:you@email.com) */
  ctaHref: '#contact-placeholder',
}

// ---- Floating words for the "research" scene ---------------------------------
export const researchWords = [
  'Joshua Van', 'Brandon Royval', 'Alexandre Pantoja', 'Kai Kara-France',
  'Jiu-Jitsu', 'Muay Thai', 'Rear-Naked Choke', 'Takedown', 'Guard', 'Clinch',
  'Armbar', 'Triangle', 'Teep', 'Sweep', 'Footwork', 'Fight Breakdown',
  'Records', 'Styles', 'Technique', 'Striking', 'Grappling', 'Cardio',
]
