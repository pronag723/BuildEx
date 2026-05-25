// BuildEx — Mock review data (builder-centric)
// Supabase migration: SELECT * FROM reviews WHERE builder_username = $1 ORDER BY created_at DESC

const REVIEWERS = [
  { username: "AlexMC",       display_name: "AlexMC",       avatar: "https://picsum.photos/id/1005/64/64" },
  { username: "SkyAdmin",     display_name: "SkyAdmin",     avatar: "https://picsum.photos/id/1011/64/64" },
  { username: "CraftedByKev", display_name: "CraftedByKev", avatar: "https://picsum.photos/id/1012/64/64" },
  { username: "LordOfMC",     display_name: "LordOfMC",     avatar: "https://picsum.photos/id/1062/64/64" },
  { username: "MysticOps",    display_name: "MysticOps",    avatar: "https://picsum.photos/id/1074/64/64" },
  { username: "ServerKing",   display_name: "ServerKing",   avatar: "https://picsum.photos/id/1080/64/64" },
];

function r(ri, rating, comment, date, project) {
  return {
    id: `${ri}-${date}-${project ?? "g"}`,
    reviewer: REVIEWERS[ri],
    rating,
    comment,
    created_at: date,
    project, // optional: which build was reviewed
  };
}

// Reviews keyed by builder username. Each builder has reviews aggregated
// across all their completed commissions.
const reviewsByBuilder = {
  pixelforge: [
    r(0, 5, "Absolutely incredible work! PixelForge's dragon tower hub is massive and the particle effects are breathtaking. My players can't stop talking about it.", "2025-05-12", "Epic Fantasy Hub"),
    r(1, 5, "Delivered beyond every expectation. Communication was perfect throughout the whole commission.", "2025-05-10", "Fantasy Hub"),
    r(2, 5, "Best builder I've ever hired. Master-tier quality from start to finish.", "2025-05-08"),
    r(3, 4, "Great commission, took one extra day but the result was absolutely worth it. Very happy with the outcome.", "2025-05-06"),
    r(4, 5, "PixelForge's ice castle work is unrivaled. Best spawn I've ever used.", "2025-05-18", "Ice Kingdom Spawn"),
    r(5, 5, "Master-level work in every sense. Multiple zones, all detailed to perfection.", "2025-05-10"),
  ],
  blockvortex: [
    r(1, 5, "The neon lighting is absolutely stunning. Very professional and delivered exactly on time.", "2025-05-09"),
    r(4, 5, "Cyberpunk aesthetic perfectly executed. My players actually thought it was a themed server.", "2025-05-07"),
    r(0, 4, "Amazing commission. Requested a small revision and it was done same day — incredible response time.", "2025-05-05"),
  ],
  craftempire: [
    r(2, 5, "Authentic medieval feel throughout. The dungeon system is genuinely terrifying in the best way.", "2025-05-06", "Medieval Castle"),
    r(5, 4, "Very detailed stonework. A few minor things needed tweaking but CraftEmpire was responsive and fixed everything.", "2025-05-04"),
    r(1, 5, "The wizard tower work is an absolute masterpiece. Hidden touches throughout the whole village.", "2025-05-01", "Fantasy Village"),
  ],
  aquabuilds: [
    r(3, 5, "The glass domes and bioluminescent plants are pure art. AquaBuilds went completely above and beyond.", "2025-05-13", "Atlantis Lobby"),
    r(0, 5, "Underwater hub of my dreams! Took slightly longer but the quality more than justified it.", "2025-05-11"),
    r(4, 4, "Great communication and beautiful end result. Would commission again without hesitation.", "2025-05-09"),
    r(5, 5, "Ship-to-ship navigation design is super creative. Players absolutely love it.", "2025-05-05", "Ocean Hub"),
  ],
  summitbuilds: [
    r(0, 5, "Mountain fortress looks incredible in game. The hidden chambers are a genius touch my players discovered over weeks.", "2025-04-29"),
    r(4, 4, "Good quality spawn. A couple of revisions needed but SummitBuilds was very accommodating.", "2025-04-27"),
  ],
  naturecraft: [
    r(2, 5, "NatureCraft truly understands organic builds. The vine overgrowth detail is completely unreal.", "2025-05-03", "Jungle Temple"),
    r(1, 5, "The jungle temple feels lived-in and authentic. Perfect for our adventure-themed server.", "2025-05-01"),
    r(5, 4, "Beautiful detailed work. Took one extra day but the end result is absolutely worth it.", "2025-04-30"),
    r(0, 5, "The enchanted forest is absolutely magical. Treehouse homes are so wonderfully creative.", "2025-05-02", "Magical Forest Village"),
  ],
  dragonbuilds: [
    r(3, 5, "DragonBuilds absolutely nailed it. Best PvP arena I've ever played on by a massive margin.", "2025-05-15", "Dragon Arena"),
    r(0, 5, "Multiple combat zones are perfectly balanced. The spectator stands add an incredible atmosphere.", "2025-05-13"),
    r(2, 5, "This arena has genuinely improved our PvP engagement by 40%. Incredible return on investment.", "2025-05-11"),
    r(4, 5, "Master Builder status is completely deserved. Every single detail is perfect.", "2025-05-09"),
    r(1, 5, "DragonBuilds' colosseum is a true masterpiece. The gladiator chambers are genuinely incredible.", "2025-05-14", "Colosseum"),
  ],
  crownccraft: [
    r(1, 5, "The vaulted ceilings and heraldic banners look absolutely royal. Stunning work throughout.", "2025-05-12", "Great Hall"),
    r(5, 5, "CrownCraft pays attention to every tiny detail. The throne room is a show-stopping centrepiece.", "2025-05-10"),
    r(3, 4, "Great hall exceeded my vision. Minor revision needed but resolved same day.", "2025-05-08"),
    r(0, 4, "Gothic cathedral atmosphere is exactly right. Stained glass windows are stunning.", "2025-05-06", "Gothic Cathedral"),
  ],
  zenblocks: [
    r(4, 5, "ZenBlocks created a truly peaceful haven. The koi ponds are beautifully detailed.", "2025-05-08", "Sakura Spawn"),
    r(2, 5, "The cherry blossom trees are absolutely breathtaking. Players always comment on the spawn.", "2025-05-06"),
    r(0, 4, "Beautiful zen aesthetic maintained throughout. Would highly recommend to anyone.", "2025-05-04"),
    r(1, 5, "ZenBlocks' bamboo village is serene perfection. The rice fields look absolutely amazing.", "2025-05-04", "Bamboo Village"),
  ],
  spawnking: [
    r(1, 4, "Clean and competitive arena. Great value for the price — exactly what I needed.", "2025-04-23"),
    r(3, 5, "Great starter PvP map. Very clean design and excellent player flow.", "2025-04-21"),
    r(0, 5, "Great value desert arena. Quick delivery for a solid PvP map.", "2025-04-19", "Desert Arena"),
  ],
  voidforge: [
    r(5, 5, "The void hub is absolutely otherworldly. The energy beams are genuinely incredible.", "2025-05-17", "Void Hub"),
    r(0, 5, "VoidForge's portal design is beyond creative. Players are always blown away.", "2025-05-15"),
    r(2, 5, "The floating platforms are perfectly laid out for exploration. Top-tier work.", "2025-05-13"),
    r(3, 5, "Space station lobby is incredible. The rotating rings effect is a stroke of genius.", "2025-05-18", "Space Station"),
  ],
  neoncraft: [
    r(4, 5, "NeonCraft's city lobby is insane. The animated billboard ads are an absolute genius touch.", "2025-05-19", "Neon City Lobby"),
    r(1, 5, "Best neon build I've ever commissioned. Absolutely worth every single penny.", "2025-05-17"),
    r(3, 5, "Futuristic architecture is breathtaking. Players always ask who built the spawn.", "2025-05-15"),
    r(0, 5, "NeonCraft delivers perfection every single time. Consistently amazing across every commission.", "2025-05-13", "Modern City Spawn"),
    r(5, 5, "Best modern city build I've ever seen. Players explored every single skyscraper.", "2025-05-19"),
  ],
};

export function getBuilderReviews(username) {
  return reviewsByBuilder[username] || [];
}

export function getBuilderRatingBreakdown(username) {
  const list = getBuilderReviews(username);
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  list.forEach((rev) => {
    breakdown[rev.rating] = (breakdown[rev.rating] || 0) + 1;
  });
  return breakdown;
}
