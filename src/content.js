import {shippingCommitment} from './business.js';
export const channel = {
  name: 'DualBore Media',
  url: 'https://www.youtube.com/@DualBoreMedia',
  community: 'https://www.youtube.com/@DualBoreMedia/community',
};

export const views = [
  { id: 'garage', label: 'Garage Builds', short: 'Garage Builds', number: '01' },
  { id: 'vault', label: 'Video Vault', short: 'Video Vault', number: '02' },
  { id: 'merch', label: 'Garage Merch (Drop 01)', short: 'Drop 01 Merch', number: '03' },
  { id: 'crew', label: 'About / Pit Crew', short: 'Pit Crew', number: '04' },
];
export const filters = ['All', 'Turbo Cars', 'V-Twins', 'Two-Strokes', 'Pit Bikes'];

export const projects = [
  {
    id: 'n54', name: 'BMW N54', tag: 'Single-turbo build series', category: 'Turbo Cars',
    image: '/assets/n54.jpg', video: 'LOOSFHJGUPM', action: 'Watch the build series',
    description: 'The N54 single-turbo project starts with the On3 kit unboxing. Follow the parts, upgrades, and garage work as the series unfolds.',
    specs: [['Platform', 'BMW N54'], ['Project focus', 'Single-turbo conversion'], ['Featured episode', 'On3 kit unboxing · Part 1']],
  },
  {
    id: 'sv1000', name: 'Suzuki SV1000S', tag: 'V-twin sound. Hands-on fixes.', category: 'V-Twins',
    image: '/assets/sv1000.jpg', video: '2Juq4oxPOo4', relatedVideo: 'XqX31p88MuA', action: 'Watch the clutch fix',
    description: 'The SV1000S project brings together clutch repairs, common problems, and the view from behind the bars.',
    specs: [['Platform', 'Suzuki SV1000S'], ['Engine layout', 'V-twin'], ['Garage focus', 'Clutch repair & common problems']],
  },
  {
    id: 'rd400', name: 'Yamaha RD400', tag: 'The two-stroke sessions', category: 'Two-Strokes',
    image: '/assets/rd400.jpg', video: 'c7gF1jjT9YQ', action: 'Watch the hills ride',
    description: 'A 1977 Yamaha RD400, open roads, and that unmistakable two-stroke sound. Ride into the hills with DualBore Media.',
    specs: [['Platform', '1977 Yamaha RD400'], ['Engine layout', 'Two-stroke twin'], ['Featured ride', 'Into the hills']],
  },
  {
    id: 'crf110', name: 'Honda CRF110', tag: 'Small bike. Backyard laps.', category: 'Pit Bikes',
    image: '/assets/pitbike.jpg', video: 'wRsSPRLMadI', action: 'Watch the track laps',
    description: 'Backyard pit-bike track laps on the CRF110. A little dirt, a little airtime, and the simple fun of another lap.',
    specs: [['Platform', 'Honda CRF110'], ['Category', 'Pit bike'], ['Featured session', 'Backyard track laps']],
  },
];

export const films = [
  { id: 'LOOSFHJGUPM', duration: '18:04', title: 'The N54 single-turbo build starts here', category: 'Turbo Cars', label: 'BUILD SERIES · PART 1', image: '/assets/episodes/LOOSFHJGUPM.jpg' },
  { id: 'c7gF1jjT9YQ', duration: '9:36', title: 'Into the hills on the 1977 RD400', category: 'Two-Strokes', label: 'RIDES · TWO-STROKE', image: '/assets/episodes/c7gF1jjT9YQ.jpg' },
  { id: '2Juq4oxPOo4', duration: '28:56', title: 'Getting the SV1000S clutch sorted', category: 'V-Twins', label: 'IN THE GARAGE · REPAIR', image: '/assets/episodes/2Juq4oxPOo4.jpg' },
  { id: 'XqX31p88MuA', duration: '11:46', title: 'SV1000S common problems & POV ride', category: 'V-Twins', label: 'FROM THE SADDLE · POV', image: '/assets/episodes/XqX31p88MuA.jpg' },
  { id: 'wRsSPRLMadI', duration: '0:56', title: 'CRF110 backyard track laps', category: 'Pit Bikes', label: 'PIT BIKES · RAW RIDING', image: '/assets/episodes/wRsSPRLMadI.jpg' },
];

export const merch = [
  { id: 'e92-tee', name: 'E92 Coupe Line-Art Tee', detail: 'E92 coupe · Line-art study', image: '/assets/IMG_5076.jpg', type: 'Graphic tee', previewPrice: 30, notes: 'A three-quarter coupe outline with the Dual Bore Media wordmark. A clean line-art tribute to the coupe, shown here on the original black-garment design mockup.' },
  { id: 'e90-crewneck', name: 'E90 Sedan Front-Clip Crewneck', detail: 'E90 sedan · Front elevation', image: '/assets/IMG_5077.jpg', type: 'Crewneck', previewPrice: 50, notes: 'A front-facing E90 illustration centered above the DualBore Media wordmark. Headlights, grille, and body lines carry the design.' },
  { id: 'sv1000s-silhouette', name: 'SV1000S Silhouette Crewneck', detail: 'SV1000S · Side profile', image: '/assets/IMG_5078.jpg', type: 'Crewneck', previewPrice: 50, notes: 'A high-contrast side-profile silhouette of the SV1000S with the DualBore Media wordmark below. For the days when the V-twin stays in the garage.' },
];
export const previewSizes = ['S', 'M', 'L', 'XL', '2XL'];
export const madeToOrder = {
  label: 'Made to order',
  processing: shippingCommitment.processing,
  returns: 'No change-of-mind returns or refunds. Incorrect, defective or materially nonconforming orders remain eligible for appropriate remedies.',
  exchanges: 'Request a voluntary size exchange within 30 calendar days of delivery. Items must be unused, unworn, unwashed, undamaged and in original condition. You pay both return and replacement shipping.',
};
