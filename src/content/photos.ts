// ============================================================================
// [PHOTO PLACEHOLDER] CONFIG
// Drop your real photos into /public/photos/ and point each slot at its file.
//   e.g.  driveway: 'photos/driveway.jpg'
// Slots left as '' show a tasteful dashed frame instead.
// Set SHOW_EMPTY_PLACEHOLDERS to false to hide every empty slot on the live site.
// ============================================================================

export const SHOW_EMPTY_PLACEHOLDERS = true

export const photos: Record<string, { src: string; caption: string }> = {
  // [PHOTO PLACEHOLDER] a picture of the family friend's house / driveway (or the night itself)
  driveway: { src: '', caption: 'The driveway, that night' },
  // [PHOTO PLACEHOLDER] you and your friend in the basement
  basement: { src: '', caption: 'Me and my friend, the basement' },
  // [PHOTO PLACEHOLDER] your first day at the gym
  gym: { src: '', caption: 'First day at the gym' },
  // [PHOTO PLACEHOLDER] you training with a partner / teammates
  mma: { src: '', caption: 'Training with the team' },
  // [PHOTO PLACEHOLDER] you today — on the mat, medals, anything
  now: { src: '', caption: 'Today, on the mat' },
}
