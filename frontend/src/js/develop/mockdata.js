const WALK_NAMES = [
  'Downtown Exploration', 'River Side Morning', 'North Bridge Crossing',
  'East District Loop', 'Sunset Boulevard Walk', 'Park Circuit Adventure',
  'Historic Quarter Tour', 'Night Ride Explorer', 'Central Park Walk',
  'Harbour View Route', 'Old Town Discovery', 'Forest Trail Hike',
  'Lake Circuit', 'Museum Mile', 'Cathedral Route', 'Riverside Promenade',
  'Victorian Quarter', 'Harbor Walk', 'Sunset Vista', 'Morning Run'
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(startYear, startMonth, endYear, endMonth) {
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth, 0);
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function generateRoute(index) {
  const date = randomDate(2025, 8, 2025, 11);
  const distance = randomInt(25, 180) / 10;
  const durationMinutes = Math.round(distance * 7);
  const durationSeconds = randomInt(0, 59);
  const coverage = randomInt(0, 1000) / 10;
  const pois = randomInt(0, 35);
  
  const nameIndex = index % WALK_NAMES.length;
  const sequenceNum = Math.floor(index / WALK_NAMES.length) + 1;
  
  return {
    id: `RT-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(index + 1).padStart(3, '0')}`,
    name: `${WALK_NAMES[nameIndex]}`,
    date: formatDate(date),
    time: formatTime(date),
    distance: distance,
    duration: {
      minutes: durationMinutes,
      seconds: durationSeconds
    },
    coverage: coverage,
    pois: pois
  };
}

export const mockRoutes = Array.from({ length: 42 }, (_, i) => generateRoute(i));