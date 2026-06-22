import { extractDateFromDateTime } from '../utils.js';

/**
 * Parses a YYYY-MM-DD value as a local midnight date.
 * @param {string} date
 * @returns {Date}
 */
export function parseLocalDate(date) {
    return new Date(`${date}T00:00:00`);
}

/**
 * Returns the local-day interval for a YYYY-MM-DD value.
 * @param {string} date
 * @returns {{start: Date, end: Date}}
 */
export function getDayInterval(date) {
    const start = parseLocalDate(date);
    const end = new Date(start.getTime());
    end.setDate(end.getDate() + 1);
    return { start, end };
}

/**
 * Returns the inclusive local-date range as a half-open Date interval.
 * @param {{startDate: string, endDate: string}} dateRange
 * @returns {{start: Date, end: Date}}
 */
export function getDateRangeInterval(dateRange) {
    return {
        start: parseLocalDate(dateRange.startDate),
        end: getDayInterval(dateRange.endDate).end
    };
}

/**
 * Returns an interval only for items that can produce a valid duration.
 * @param {Object} item
 * @param {Date} [now=new Date()]
 * @returns {{start: Date, end: Date}|null}
 */
export function getDurationCapableInterval(item, now = new Date()) {
    const start = new Date(item.startDateTime);
    const end = item.endDateTime ? new Date(item.endDateTime) : now;

    if (!isFinite(start.getTime()) || !isFinite(end.getTime()) || end <= start) {
        return null;
    }

    return { start, end };
}

/**
 * Returns true when two half-open intervals overlap.
 * @param {{start: Date, end: Date}} left
 * @param {{start: Date, end: Date}} right
 * @returns {boolean}
 */
export function intervalsOverlap(left, right) {
    return left.start < right.end && left.end > right.start;
}

/**
 * Clips a duration-capable item to a visible interval.
 * @param {Object} item
 * @param {{start: Date, end: Date}} visibleInterval
 * @param {Date} [now=new Date()]
 * @returns {{start: Date, end: Date}|null}
 */
export function getClippedDurationInterval(item, visibleInterval, now = new Date()) {
    const itemInterval = getDurationCapableInterval(item, now);

    if (!itemInterval || !intervalsOverlap(itemInterval, visibleInterval)) {
        return null;
    }

    return {
        start: new Date(Math.max(itemInterval.start.getTime(), visibleInterval.start.getTime())),
        end: new Date(Math.min(itemInterval.end.getTime(), visibleInterval.end.getTime()))
    };
}

/**
 * Returns true when an item has a valid duration interval overlapping a visible interval.
 * @param {Object} item
 * @param {{start: Date, end: Date}} visibleInterval
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function itemOverlapsInterval(item, visibleInterval, now = new Date()) {
    const itemInterval = getDurationCapableInterval(item, now);
    return Boolean(itemInterval && intervalsOverlap(itemInterval, visibleInterval));
}

/**
 * Returns true when an invalid activity has either endpoint inside a visible interval.
 * @param {Object} item
 * @param {{start: Date, end: Date}} visibleInterval
 * @returns {boolean}
 */
export function invalidActivityTouchesInterval(item, visibleInterval) {
    const start = new Date(item.startDateTime);
    const end = new Date(item.endDateTime);

    if (!isFinite(start.getTime()) || !isFinite(end.getTime()) || end > start) {
        return false;
    }

    return (
        isPointWithinInterval(start, visibleInterval) || isPointWithinInterval(end, visibleInterval)
    );
}

/**
 * Returns an interval duration in rounded minutes.
 * @param {{start: Date, end: Date}} interval
 * @returns {number}
 */
export function getIntervalDuration(interval) {
    return Math.max(0, Math.round((interval.end.getTime() - interval.start.getTime()) / 60000));
}

/**
 * Returns the overlapped duration for an item inside a visible interval.
 * @param {Object} item
 * @param {{start: Date, end: Date}} visibleInterval
 * @param {Date} [now=new Date()]
 * @returns {number}
 */
export function getOverlapDuration(item, visibleInterval, now = new Date()) {
    const clippedInterval = getClippedDurationInterval(item, visibleInterval, now);
    return clippedInterval ? getIntervalDuration(clippedInterval) : 0;
}

/**
 * Gets the default range for the last N local days ending at today.
 * @param {Date} [today=new Date()]
 * @param {number} days
 * @returns {{startDate: string, endDate: string}}
 */
export function getLastLocalDaysDateRange(today = new Date(), days) {
    const endDate = new Date(today.getTime());
    const startDate = new Date(today.getTime());
    startDate.setDate(startDate.getDate() - days + 1);

    return {
        startDate: extractDateFromDateTime(startDate),
        endDate: extractDateFromDateTime(endDate)
    };
}

function isPointWithinInterval(point, visibleInterval) {
    return point >= visibleInterval.start && point < visibleInterval.end;
}
