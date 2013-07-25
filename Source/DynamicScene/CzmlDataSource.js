/*global define*/
define([
        '../Core/ClockRange',
        '../Core/ClockStep',
        '../Core/DeveloperError',
        '../Core/Event',
        '../Core/Iso8601',
        '../Core/loadJson',
        './DynamicClock',
        './processCzml',
        './DynamicObjectCollection',
        '../ThirdParty/when'
    ], function(
        ClockRange,
        ClockStep,
        DeveloperError,
        Event,
        Iso8601,
        loadJson,
        DynamicClock,
        processCzml,
        DynamicObjectCollection,
        when) {
    "use strict";

    function loadCzml(dataSource, czml, sourceUri) {
        var dynamicObjectCollection = dataSource._dynamicObjectCollection;
        processCzml(czml, dynamicObjectCollection, sourceUri);
        var availability = dynamicObjectCollection.computeAvailability();

        var clock;
        var documentObject = dynamicObjectCollection.getObject('document');
        if (typeof documentObject !== 'undefined' && typeof documentObject.clock !== 'undefined') {
            clock = new DynamicClock();
            clock.startTime = documentObject.clock.startTime;
            clock.stopTime = documentObject.clock.stopTime;
            clock.clockRange = documentObject.clock.clockRange;
            clock.clockStep = documentObject.clock.clockStep;
            clock.multiplier = documentObject.clock.multiplier;
            clock.currentTime = documentObject.clock.currentTime;
        } else if (!availability.start.equals(Iso8601.MINIMUM_VALUE)) {
            clock = new DynamicClock();
            clock.startTime = availability.start;
            clock.stopTime = availability.stop;
            clock.clockRange = ClockRange.LOOP_STOP;
            var totalSeconds = clock.startTime.getSecondsDifference(clock.stopTime);
            var multiplier = Math.round(totalSeconds / 120.0);
            clock.multiplier = multiplier;
            clock.currentTime = clock.startTime;
            clock.clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
        }

        if (typeof dataSource._name === 'undefined') {
            var name;
            if (typeof documentObject !== 'undefined') {
                //name = documentObject.name;
            }

            if (typeof name === 'undefined') {
                name = sourceUri.substr(sourceUri.lastIndexOf('/') + 1);
            }

            dataSource._name = name;
        }

        return clock;
    }

    /**
     * A {@link DataSource} which processes CZML.
     * @alias CzmlDataSource
     * @constructor
     *
     * @param {String} [name] The name of this data source.  If undefined, a name will be read from the
     *                        loaded CZML document, or the name of the CZML file.
     */
    var CzmlDataSource = function(name) {
        this._name = name;
        this._changed = new Event();
        this._error = new Event();
        this._clock = undefined;
        this._dynamicObjectCollection = new DynamicObjectCollection();
        this._timeVarying = true;
    };

    /**
     * Gets the name of this data source.
     * @memberof CzmlDataSource
     *
     * @returns {String} The name.
     */
    CzmlDataSource.prototype.getName = function() {
        return this._name;
    };

    /**
     * Gets an event that will be raised when non-time-varying data changes
     * or if the return value of getIsTimeVarying changes.
     * @memberof CzmlDataSource
     *
     * @returns {Event} The event.
     */
    CzmlDataSource.prototype.getChangedEvent = function() {
        return this._changed;
    };

    /**
     * Gets an event that will be raised if an error is encountered during processing.
     * @memberof CzmlDataSource
     *
     * @returns {Event} The event.
     */
    CzmlDataSource.prototype.getErrorEvent = function() {
        return this._error;
    };

    /**
     * Gets the top level clock defined in CZML or the availability of the
     * underlying data if no clock is defined.  If the CZML document only contains
     * infinite data, undefined will be returned.
     * @memberof CzmlDataSource
     *
     * @returns {DynamicClock} The clock associated with the current CZML data, or undefined if none exists.
     */
    CzmlDataSource.prototype.getClock = function() {
        return this._clock;
    };

    /**
     * Gets the DynamicObjectCollection generated by this data source.
     * @memberof CzmlDataSource
     *
     * @returns {DynamicObjectCollection} The collection of objects generated by this data source.
     */
    CzmlDataSource.prototype.getDynamicObjectCollection = function() {
        return this._dynamicObjectCollection;
    };

    /**
     * Gets a value indicating if the data varies with simulation time.  If the return value of
     * this function changes, the changed event will be raised.
     * @memberof CzmlDataSource
     *
     * @returns {Boolean} True if the data is varies with simulation time, false otherwise.
     */
    CzmlDataSource.prototype.getIsTimeVarying = function() {
        return this._timeVarying;
    };

    /**
     * Processes the provided CZML without clearing any existing data.
     *
     * @param {Object} czml The CZML to be processed.
     * @param {String} source The source of the CZML.
     *
     * @exception {DeveloperError} czml is required.
     */
    CzmlDataSource.prototype.process = function(czml, source) {
        if (typeof czml === 'undefined') {
            throw new DeveloperError('czml is required.');
        }

        this._clock = loadCzml(this, czml, source);
    };

    /**
     * Replaces any existing data with the provided CZML.
     *
     * @param {Object} czml The CZML to be processed.
     * @param {String} source The source of the CZML.
     *
     * @exception {DeveloperError} czml is required.
     */
    CzmlDataSource.prototype.load = function(czml, source) {
        if (typeof czml === 'undefined') {
            throw new DeveloperError('czml is required.');
        }

        this._dynamicObjectCollection.clear();
        this._clock = loadCzml(this, czml, source);
    };

    /**
     * Asynchronously processes the CZML at the provided url without clearing any existing data.
     *
     * @param {Object} url The url to be processed.
     *
     * @returns {Promise} a promise that will resolve when the CZML is processed.
     *
     * @exception {DeveloperError} url is required.
     */
    CzmlDataSource.prototype.processUrl = function(url) {
        if (typeof url === 'undefined') {
            throw new DeveloperError('url is required.');
        }

        var dataSource = this;
        return when(loadJson(url), function(czml) {
            dataSource.process(czml, url);
        }, function(error) {
            dataSource._error.raiseEvent(dataSource, error);
            return when.reject(error);
        });
    };

    /**
     * Asynchronously loads the CZML at the provided url, replacing any existing data.
     *
     * @param {Object} url The url to be processed.
     *
     * @returns {Promise} a promise that will resolve when the CZML is processed.
     *
     * @exception {DeveloperError} url is required.
     */
    CzmlDataSource.prototype.loadUrl = function(url) {
        if (typeof url === 'undefined') {
            throw new DeveloperError('url is required.');
        }

        var dataSource = this;
        return when(loadJson(url), function(czml) {
            dataSource.load(czml, url);
        }, function(error) {
            dataSource._error.raiseEvent(dataSource, error);
            return when.reject(error);
        });
    };

    return CzmlDataSource;
});