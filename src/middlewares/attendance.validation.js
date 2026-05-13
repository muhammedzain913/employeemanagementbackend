const toNumber = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
};

/**
 * Ensures check-in body has finite lat/lng within geographic ranges.
 * True GPS spoofing cannot be disproved server-side; this rejects invalid or placeholder coordinates.
 */
function validateCheckInCoordinates(req, res, next) {
  const { latitude, longitude } = req.body ?? {};

  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return next(new Error('latitude and longitude are required'));
  }

  const lat = toNumber(latitude);
  const lng = toNumber(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return next(new Error('latitude and longitude must be valid numbers'));
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return next(new Error('latitude or longitude out of valid range'));
  }

  if (lat === 0 && lng === 0) {
    return next(new Error('Invalid coordinates'));
  }

  req.checkInCoordinates = { latitude: lat, longitude: lng };
  next();
}

module.exports = { validateCheckInCoordinates };
