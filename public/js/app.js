var HAPPENING = {};

// utility functions
HAPPENING.utils = {
    // finds distance between two coordinate pairs note that this
    calculateDistance: function(lat1, lon1, lat2, lon2) {
        // 0 is technically an acceptable input
        if (typeof lat1 === undefined || typeof lat1 === null || typeof lon1 === undefined || typeof lon1 === null || typeof lat2 === undefined || typeof lat2 === null || typeof lon2 === undefined || typeof lon2 === null) {
            throw {
                "name": "invalid arguments to calculateDistance()",
                "message": "one or more of the arguments to calculateDistance(), which should all be latitude or longitude values, is invalid"
            }
        }
        // uses the haversine formula rather than Vincenty's fomulae for performance reasons
        // radius of the Earth (approximated sphere) in miles
        var radius = 3963;
        // delta of latitudes and longitudes, converted to radians
        var dLat = Math.abs(lat2-lat1) * Math.PI / 180;
        var dLon = Math.abs(lon2-lon1) * Math.PI / 180;
        // both latitudes converted to radians
        lat1 = lat1 * Math.PI / 180;
        lat2 = lat2 * Math.PI / 180;
        // apply haversine formula
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) *Math.cos(lat2); 
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        var d = radius * c;
        // return distance along Earth's surface
        return d;
    },
    // accepts a url (and a method, which defaults to "GET" if not passed) and returns result of an API call
    makeHttpRequest: function(url, method) {
        var result;
        $.ajax({
            async: false,
            url: url,
            type: method || "GET"
        })
        .done(function (response) {result = response;});
        // browsers differ in whether they automatically convert the response to an object or not
        if (typeof result === 'string') {
            result = $.parseJSON(result);
        };
        return result;
    },
    // accepts an ERB-style template string, an object to apply to the string, and returns the templatized string
    templatize: function(templateString, templateDataObject) {
        var htmlConstructor = _.template(templateString);
        return htmlConstructor(templateDataObject);
    },
    // function that uses various methods to find user location
    findCurrentUserLocation: function() {
        // TODO: geolocation code is commented out until it can be tested in multiple locations; needs to be added back in
        locationObject = {
            'address': {
                'city': "New York City",
                'country': "USA"
            },
            'latitude': 40.75,
            'longitude': -73.997
        };
        return locationObject;
        /*
        // initialize location object to return
        var locationObject = {
            'address': {
                'city': null,
                'country': null
            },
            'latitude': null,
            'longitude': null
        };
        // try google's location API, which doesn't require the user to actively approve
        if (google.loader.ClientLocation !== undefined && google.loader.ClientLocation !== null) {
            locationObject.address.city = google.loader.ClientLocation.address.city,
            locationObject.address.country = google.loader.ClientLocation.address.country,
            locationObject.latitude = google.loader.ClientLocation.latitude,
            locationObject.longitude = google.loader.ClientLocation.longitude;
        }
        // try the W3C standard API, which requires the user to actively assent
        else if (typeof navigator.geolocation.getCurrentPosition !== undefined) {
            navigator.geolocation.getCurrentPosition(
            // first argument is the success function
            function(position) {
                // the navigation API can only give us lat and long...
                locationObject.latitude = position.coords.latitude, locationObject.longitude = position.coords.longitude;
                // so we have to use them to perform a reverse lookup
                var openStreetMapUrl = "http://nominatim.openstreetmap.org/reverse?format=json&lat=" + locationObject.latitude + "&lon=" + locationObject.longitude;
                var reverseLookupResponse = HAPPENING.utils.makeHttpRequest(openStreetMapUrl);
                locationObject.address.city = reverseLookupResponse.address.city,
                locationObject.address.country = reverseLookupResponse.address.country;
            },
            // second argument is the failure function
            function() {
                throw {
                    'name': 'Browser Geolocation API error',
                    'message': "This function shouldn\t be failing, because it shouldn\'t even be called if the geolocation API isn\'t accessible"
                };
            });
        }
        // if all else fails, set location to New York, baby!
        else {
            locationObject = {
                'address': {
                    'city': "New York City",
                    'country': "USA"
                },
                'latitude': 40.75,
                'longitude': -73.997
            };
        };
        return locationObject;
        */
    },
    // a function for turning raw location objects from the server into something that can be displayed by jquery UI autocomplete
    locationProcessDataFunction: function(rawData) {
        var processedData = [];
        rawData.forEach(function(rawSingle) {
            processedSingle = {};
            processedSingle.label = rawSingle.name + ', ';
            if (rawSingle.countryCode === 'US') {
                processedSingle.label += rawSingle.admin1Code;
            }
            else {
                processedSingle.label += rawSingle.countryCode;
            };
            processedSingle.id = rawSingle.geonameID;
            processedSingle.latitude = rawSingle.loc.coordinates[1];
            processedSingle.longitude = rawSingle.loc.coordinates[0];
            processedSingle.country = rawSingle.countryCode;
            processedSingle.admin1Code = rawSingle.admin1Code;
            processedSingle.timezone = rawSingle.timezone;
            processedData.push(processedSingle);
        });
        return processedData;
    }
};

HAPPENING.settings = {
    baseUrl: 'http://' + window.location.hostname + ':3000'
};

HAPPENING.models = {
    User: Backbone.Model.extend({
        defaults: {
            currentlyViewedLocation: undefined,
            currentlyViewedTag: undefined,
            currentlyViewedComparator: 'distance'
        },
        initialize: function() {
            this.on("change:currentlyViewedLocation", function(model) {
                HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
            });
            this.on("change:currentlyViewedTag", function(model) {
                HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
            });
        },
        // a function that returns true if the user's location is defined sufficiently for the purposes of geodesy and information display, and returns false if it isn't
        isLocationDefined: function() {
            if (this.get("currentlyViewedLocation").latitude !== null && this.get("currentlyViewedLocation").latitude !== undefined && this.get("currentlyViewedLocation").longitude !== null && this.get("currentlyViewedLocation").longitude !== undefined) {
                return true;
            }
            else {
                return false
            };
        }
    }),
    Happening: Backbone.Model.extend({
        initialize: function() {
            var self = this;
            var dateArray = {
                beginDate: new Date(self.get("dates").beginDate),
                endDate: new Date(self.get("dates").endDate)
            };
            this.set("dates", dateArray);
        },
        distanceFromLocation: function(locationObject) {
            var lat1 = locationObject.latitude;
            var long1 = locationObject.longitude;
            var lat2 = this.get('location').latitude;
            var long2 = this.get('location').longitude;
            var distance = HAPPENING.utils.calculateDistance(lat1, long1, lat2, long2);
            return distance;
        },
        idAttribute: '_id'
    }),
    Location: Backbone.Model.extend({
    })
};

HAPPENING.collections = {
    HappeningCollection: Backbone.Collection.extend({
        model: HAPPENING.models.Happening,
        // these functions are used to create comparator functions dynamically based on a target date or location
        comparatorConstructors: {
            distanceFromLocation: function(happening, location) {
                return happening.distanceFromLocation(location);
            },
            timeFromDate: function(happening, date) {
                var timeDistance = happening.get('dates').beginDate - date;
                return timeDistance;
            }
        },
        // the comparator function determines sorting
        comparator: function(happening){
            return this.comparatorConstructors.distanceFromLocation(happening, HAPPENING.applicationSpace.user.get('currentlyViewedLocation'));
        },
        // handling function for changing the comparator
        changeComparator: function(type, target){
            var newComparator = function(happening) {
                return this.comparatorConstructors[type](happening, target);
            };
            this.comparator = newComparator;
            this.sort();
        }, 
        initialize: function() {
            var self = this;
            this.url = function() {
                var requestUrl = '';
                requestUrl += HAPPENING.settings.baseUrl;
                requestUrl += '/happenings';
                var parameterMap = [];
                var currentlyViewedTag = HAPPENING.applicationSpace.user.get("currentlyViewedTag");
                if (HAPPENING.applicationSpace.user.get("currentlyViewedTag") !== undefined) {
                    parameterMap.push({
                        key: 'tags',
                        value: currentlyViewedTag
                    });
                };
                var currentlyViewedLocation = HAPPENING.applicationSpace.user.get('currentlyViewedLocation');
                if (currentlyViewedLocation !== undefined) {
                    parameterMap.push({
                        key: 'latitude',
                        value: currentlyViewedLocation.latitude
                    });
                    parameterMap.push({
                        key: 'longitude',
                        value: currentlyViewedLocation.longitude
                    });
                };
                for (var i = 0; i < parameterMap.length; i++) {
                    if (i === 0) {
                        requestUrl += '?';
                    }
                    else {
                        requestUrl += '&';
                    };
                    requestUrl += parameterMap[i].key;
                    requestUrl += '=';
                    requestUrl += parameterMap[i].value;
                };
                return requestUrl;
            };
        }
    })
};

HAPPENING.views = {
    // this master view doesn't actually render anything, it just renders other views
    ApplicationView: Backbone.View.extend({
        initialize: function() {
            this.happeningsView = new HAPPENING.views.HappeningsView({
                el: "#happenings-container"
            });
        },
        initializeOtherThanHappeningsView: function() {
            this.modalUnderlayView = new HAPPENING.views.ModalUnderlayView({
                el: '#modal-underlay'
            });
            // initialize (and self-render) all the necessary views
            this.masterSelectorView = new HAPPENING.views.MasterSelectorView({
                el: "#master-selector-container"
            });
            this.happeningSubmissionView = new HAPPENING.views.SubmissionView({
                el: "#happening-submission-container",
                resourceName: 'happening',
                postParameters: [
                    {
                        label: 'What\'s this happening called?',
                        id: "name",
                        type: "string"
                    },
                    {
                        label: 'Where will it take place?',
                        id: "cityid",
                        type: "location"
                    },
                    {
                        label: 'When does it start?',
                        id: "begindate",
                        type: "date"
                    },
                    {
                        label: 'When does it end?',
                        id: "enddate",
                        type: "date"
                    },
                    {
                        label: 'What is the website?',
                        id: "websiteurl",
                        type: "url" 
                    },
                    {
                        label: 'Tag this happening',
                        id: "tags",
                        type: "tags" 
                    }
                ],
                httpMethod: 'POST',
                header: "Add a New Happening",
                description: 'Are we missing a particular happening? Add it here.',
                submitText: 'Add This Happening',
                submitFunction: function() {
                    HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
                }
            });
            this.happeningEditView = new HAPPENING.views.SubmissionView({
                el: "#happening-edit-container",
                resourceName: 'happening',
                postParameters: [
                    {
                        label: 'What\'s this happening called?',
                        id: "name",
                        type: "string"
                    },
                    {
                        label: 'Where will it take place?',
                        id: "cityid",
                        type: "location"
                    },
                    {
                        label: 'When does it start?',
                        id: "begindate",
                        type: "date"
                    },
                    {
                        label: 'When does it end?',
                        id: "enddate",
                        type: "date"
                    },
                    {
                        label: 'What is the website?',
                        id: "websiteurl",
                        type: "url" 
                    },
                    {
                        label: 'Tag this happening:',
                        id: "tags",
                        type: "tags" 
                    }
                ],
                httpMethod: 'PUT',
                header: 'Edit Happening',
                description: 'Is something about this happening inaccurate? Fix it here.',
                submitText: 'Change it!',
                submitFunction: function() {
                    HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
                }
            });
            this.toolbarView = new HAPPENING.views.ToolbarView({
                el: '#toolbar'
            });
            this.masterComparatorSelectorView = new HAPPENING.views.MasterComparatorSelectorView({
                el: '#master-comparator-selector-view'
            });
        }
    }),
    MasterComparatorSelectorView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).empty();
            $(this.el).append('<div class="comparator-selector-label">Sort By:</div><div id="distance-comparator-selector" class="comparator-selected"></div><div id="date-comparator-selector"></div>');
            this.distanceComparatorSelectorView = new HAPPENING.views.ComparatorSelectorView({
                el: '#distance-comparator-selector',
                label: 'Distance',
                comparatorConstructor: 'distanceFromLocation',
                target: function(){
                    return HAPPENING.applicationSpace.user.get('currentlyViewedLocation');
                }
            });
            this.dateComparatorSelectorView = new HAPPENING.views.ComparatorSelectorView({
                el: '#date-comparator-selector',
                label: 'Date',
                comparatorConstructor: 'timeFromDate',
                target: function(){
                    return new Date();
                }
            });
        }
    }),
    MasterSelectorView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).append('<span class="master-selector-segment">Events tagged</span>');
            $(this.el).append('<span class="master-selector-segment"  id="tag-selector"></span>');
            $(this.el).append('<span class="master-selector-segment">near</span>');
            $(this.el).append('<span class="master-selector-segment"  id="location-selector"></span>');
            $(this.el).append('<span class="master-selector-segment">.</span>');
            this.tagSearchView = new HAPPENING.views.SearchView({
                el: "#tag-selector",
                addFormElement: true,
                resourceUrl: HAPPENING.settings.baseUrl + '/tags/search',
                processData: function(rawData) {
                    var processedData = [];
                    rawData.forEach(function(rawSingle) {
                        processedSingle = {};
                        processedSingle.label = rawSingle;
                        processedSingle.id = rawSingle;
                        processedData.push(processedSingle);
                    });
                    if (rawData.length <= 7) { 
                        processedData.push({
                            "label": "anything",
                            "id": undefined
                        });
                    };
                    return processedData;
                },
                selectFunction: function(event, ui) {
                    HAPPENING.applicationSpace.user.set("currentlyViewedTag", ui.item.id);
                },
                initialMostRecentlySubmittedVal: 'anything'
            });
            this.locationSearchView = new HAPPENING.views.SearchView({
                el: "#location-selector",
                addFormElement: true,
                resourceUrl: HAPPENING.settings.baseUrl + '/cities/search',
                processData: HAPPENING.utils.locationProcessDataFunction,
                selectFunction: function(event, ui) {
                    HAPPENING.applicationSpace.user.set("currentlyViewedLocation", {
                        latitude: ui.item.latitude,
                        longitude: ui.item.longitude,
                        address : {
                            country: ui.item.country,
                            city: ui.item.label
                        },
                        timezone: ui.item.timezone
                    });
                },
                initialMostRecentlySubmittedVal: 'New York City, NY'
            });
            // a dummy event argument is required to make selectFunction work
            var dummyEvent = undefined;
            // get user's currently selected location and convert it into an object that can be passed to selectFunction
            var locationSearchUi = {};
            var currentLocation = HAPPENING.utils.findCurrentUserLocation();
            locationSearchUi.item = {
                // TODO: id being 0 is a hack
                id: 0,
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                country: currentLocation.address.country,
                label:  currentLocation.address.city
            };
            // get user's currently selected tag and convert it into an object that can be passed to selectFunction
            var tagSearchUi = {};
            tagSearchUi.item = {
                id: undefined,
                label: 'anything'
            };
            // trigger selectFunction for inputs, using appropriate ui objects
            this.tagSearchView.options.selectFunction(dummyEvent, tagSearchUi);
            this.locationSearchView.options.selectFunction(dummyEvent, locationSearchUi);
            // populate initial values underlying views on application boot into the input
            $(this.tagSearchView.el).find('input').val(this.tagSearchView.options.initialMostRecentlySubmittedVal);
            $(this.locationSearchView.el).find('input').val(this.locationSearchView.options.initialMostRecentlySubmittedVal);
        }
    }),
    // a generic view for autocomplete-enabled search input view
    SearchView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            var self = this;
            if (this.options.addFormElement === true) {
                $(this.el).append("<form>" + (this.options.description || "") + "<input type='text'></input></form>");
            }
            else {
                $(this.el).append((this.options.description || "") + "<input type='text' name='" + (this.options.description || "") + "'></input>");
            };
            this.mostRecentlySubmittedVal = this.options.initialMostRecentlySubmittedVal;
            // prevent page reload on submission; note that the base input element's 'submit' event and the autocomplete's 'select' event are different
            $(this.el).find('form').on('submit', function() {
                return false;
            });
            // code for ensuring that the input is wiped on focus, and that the input has its most recently submitted value restored on blur
            $(this.el).find('input').on('focus', function() {
                $(self.el).find('input').val('');
            });
            $(this.el).find('input').on('blur', function() {
                $(self.el).find('input').val(self.mostRecentlySubmittedVal);
            });
            // add autocomplete behavior to element
            $(this.el).find("input").autocomplete({
                source: function(request, response) {
                    var searchString = request.term;
                    // the searchstring split on ',' is a hack to make sure that users searching for 'Chicago, IL' for example -- which is what the displayed autocomplete val might encourage them to do -- aren't penalized
                    var rawData = HAPPENING.utils.makeHttpRequest(self.options.resourceUrl + '?searchstring=' + searchString.split(',')[0]);
                    var processedData = self.options.processData(rawData);
                    response(processedData);
                },
                autoFocus: true,
                select: function(event, ui) {
                    self.options.selectFunction(event, ui);
                    self.mostRecentlySubmittedVal = ui.item.label;
                    $(self.el).find("input").val(ui.item.label);
                },
                minLength: 1
            });
        }
    }),
    TagView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            var self = this;
            $(this.el).append((this.options.description || "") + "<ul></ul>");
            $(this.el).find('ul').tagit({
                autocomplete: {
                    source: function(request, response) {
                        var searchString = request.term;
                        var rawData = HAPPENING.utils.makeHttpRequest(self.options.resourceUrl + '?searchstring=' + searchString);
                        var processedData = self.options.processData(rawData);
                        response(processedData);
                    },
                    select: self.options.selectFunction,
                    minLength: 1
                },
                showAutocompleteOnFocus: true,
                allowSpaces: true,
                singleField: true
            });
        }
    }),
    // generic view for submission forms
    SubmissionView: Backbone.View.extend({
        // view renders when created
        initialize: function() {
            this.render();
        },
        render: function() {
            var self = this;
            // make sure the target el is invisible before putting anything in it
            $(this.el).addClass('submission-view-modal');
            $(this.el).addClass('invisible');
            // get the list of parameters to be posted by the form from the newly created view object
            var postParameters = this.options.postParameters;
            // clear el
            $(this.el).empty();
            // add html for the form
            $(this.el).append("<span class='submission-view-header'>" + this.options.header + "</span>");
            $(this.el).append("<span class='submission-view-description'>" + this.options.description + "</span>");
            $(this.el).append("<form></form>");
            // functions to create an input based on the type of that input's object
            var inputConstructionFunctions = {
                date: function(postParameter) {
                    self.currentFocusedDate = new Date();
                    $(self.el).find("#" + postParameter.id).append('<span class="post-parameter-label">' + postParameter.label + "</span><input type='text' name='" + postParameter.id + "'></input>");
                    var datepickerOptions = {
                        dateFormat: 'yy-mm-dd',
                        constrainInput: true,
                        showAnim: 'slideDown'
                    };
                    $(self.el).find("#" + postParameter.id + " input").datepicker(datepickerOptions);
                    // if the user picks a begindate, we autofocus them on that date when they open the enddate input 
                    if (postParameter.id === 'enddate') {
                        $(self.el).find("#begindate input").datepicker('option', 'onSelect', function(date) {
                            $(self.el).find("#enddate input").datepicker('option', 'defaultDate', new Date(date));
                        });
                    };
                },
                tags: function(postParameter) {
                    self.tagInputView = new HAPPENING.views.TagView({
                        el: function() {
                            return "#" + $(self.el).attr('id') + " #" + postParameter.id;
                        },
                        description: ('<span class="post-parameter-label">' + postParameter.label + '</span>'),
                        resourceUrl: HAPPENING.settings.baseUrl + '/tags/search',
                        processData: function(rawData) {
                            var processedData = [];
                            rawData.forEach(function(rawSingle) {
                                processedSingle = {};
                                processedSingle.label = rawSingle;
                                processedSingle.id = rawSingle;
                                processedData.push(processedSingle);
                            });
                            return processedData;
                        }
                    });
                },
                location: function(postParameter) {
                    self.locationInputView = new HAPPENING.views.SearchView({
                        el: function() {
                            return "#" + $(self.el).attr('id') + " #" + postParameter.id;
                        },
                        description: ('<span class="post-parameter-label">' + postParameter.label + "</span>"),
                        resourceUrl: HAPPENING.settings.baseUrl + '/cities/search',
                        processData: HAPPENING.utils.locationProcessDataFunction,
                        selectFunction: function(event, ui) {
                            self.location = new HAPPENING.models.Location({
                                latitude: ui.item.latitude,
                                longitude: ui.item.longitude,
                                address : {
                                    country: ui.item.country,
                                    city: ui.item.label,
                                    cityId: ui.item.id
                                },
                                timezone: ui.item.timezone
                            });
                        }
                    });
                },
                _misc: function(postParameter) {
                    $(self.el).find("#" + postParameter.id).append('<span class="post-parameter-label">' + postParameter.label + "</span><input type='text' name='" + postParameter.id + "'></input>");
                }
            };
            // client-side validity checks for the various types of url parameters; corresponds generally to the checks in the server-side application
            var inputValidityChecks = {
                number: function(parameter) {
                    if (isNaN(Number(parameter))) {
                        return false;
                    }
                    else {
                        return true;
                    };
                },
                string: function(parameter) {
                    return true;
                },
                date: function(parameter) {
                    if (isNaN(Date.parse(parameter))) {
                        return false;
                    }
                    else {
                        return true;
                    };
                },
                mongoObjectId: function(parameter) {
                    var objectIdRegExp = new RegExp("^[0-9a-fA-F]{24}$");
                    var validityArray = parameterArray.map(function(singleParameter) {
                        return objectIdRegExp.test(singleParameter)
                    });
                    if (validityArray.indexOf(false) === -1) {
                        var validity = true;
                    }
                    else {
                        var validity = false;
                    };
                    return validity;
                },
                url: function(parameter) {
                    var urlValidity = false;
                    if (parameter.indexOf('.') !== -1) {
                        urlValidity = true;
                    };
                    return urlValidity;
                }
            };
            postParameters.forEach( function(postParameter) {
                $(self.el).find("form").append("<div class='submission-view-input' id='" + postParameter.id + "'></div>");
                if (inputConstructionFunctions[postParameter.type] !== undefined) {
                    inputConstructionFunctions[postParameter.type](postParameter);
                }
                else {
                    inputConstructionFunctions['_misc'](postParameter);
                };
            });
            // functions for fetching the parameter value when assembling a request url
            var convertWallTimeToUTCString = function(timezoneString, dateString) {
                return WallTime.WallTimeToUTC(timezoneString, new Date(dateString)).toUTCString().split(' GMT')[0].split(', ')[1];
            };
            var inputParameterGetters = {
                tags: function(postParameter) {
                    var tagString = $(self.el).find('input[type="hidden"]').val();
                    return tagString;
                },
                cityid: function(postParameter) {
                    return self.location.get("address").cityId;
                },
                begindate: function () {
                    return convertWallTimeToUTCString(self.location.get('timezone'), $(self.el).find("input[name='begindate']").val());
                },
                enddate: function () {
                    return convertWallTimeToUTCString(self.location.get('timezone'), $(self.el).find("input[name='enddate']").val());
                },
                _misc: function(postParameter) {
                    return $(self.el).find("input[name=\"" + postParameter.id + "\"]").val();
                }
            };
            // append submit button to form
            $(this.el).find("form").append("<div><input type='submit' value='" + this.options.submitText + "'></input></div>");
            // create the event that makes a post request upon submitting the form
            $(this.el).find("form").on("submit", function(event) {
                // stop the automatic page reload upon form submission
                event.preventDefault();
                try {
                    // check to make sure all inputs are filled in
                    postParameters.forEach(function(postParameter) {
                        var inputEl;
                        if (postParameter.id === 'tags') {
                            inputEl = $(self.el).find("#" + postParameter.id + " input[type='hidden']");
                        }
                        else {
                            inputEl = $(self.el).find("#" + postParameter.id + " input");
                        };
                        if (inputEl.val() === undefined || (inputEl.val() === "")) {
                            throw {
                                name: "all post parameters must be set",
                                message: "one or more post parameters are not set"
                            };
                        }; 
                    });
                    // client-side validity checking for input values
                    postParameters.forEach(function(postParameter) {
                        if (inputValidityChecks[postParameter.type] !== undefined) {
                            var inputValue = $(self.el).find("#" + postParameter.id + " input").val();
                            if (inputValidityChecks[postParameter.type](inputValue) === false) {
                                throw {
                                    name: "failed validity check for" + postParameter.id,
                                    message: 'value ' + inputValue + ' for ' + postParameter.id + 'is invalid'
                                };
                            };
                        }; 
                    });
                    var postRequest = HAPPENING.settings.baseUrl + '/' + self.options.resourceName + 's';
                    if (self.options.resourceName === 'happening' && self.options.httpMethod === 'PUT') {
                        postRequest += '/';
                        postRequest += self.model.get('_id');
                    };
                    postRequest += '?';
                    postParameters.forEach(function(postParameter) {
                        var parameterValue;
                        if (inputParameterGetters[postParameter.id] !== undefined) {
                            parameterValue = inputParameterGetters[postParameter.id](postParameter);
                        }
                        else {
                            parameterValue = inputParameterGetters['_misc'](postParameter);
                        };
                        postRequest += postParameter.id;
                        postRequest += '=';
                        postRequest += parameterValue;
                        postRequest += "&";
                    });
                    var postResponse = HAPPENING.utils.makeHttpRequest(postRequest, self.options.httpMethod);
                    self.options.submitFunction();
                    HAPPENING.applicationSpace.applicationView.modalUnderlayView.hideSubmissionViews();
                } 
                catch (e) {
                    alert(e.name + ': ' + e.message)
                };
            });
        }
    }),
    HappeningsView: Backbone.View.extend({
        initialize: function() {
            // append a loading animation to tide us over until the collection resets
            $(this.el).html("[LOADING ANIMATION]");
            // create a new collection, which will fetch models and trigger a redraw of this view
            this.collection = new HAPPENING.collections.HappeningCollection();
            // set this view to render whenever its collection resets (sorting triggers a reset)
            this.listenTo(this.collection, 'reset', this.render);
            this.listenTo(this.collection, 'sort', this.render);
        },
        render: function() {
            var self = this;
            $(this.el).empty();
            var htmlToInject = "";
            if (this.collection.length === 0) {
                htmlToInject = "There don't seem to be any happenings with that tag!";
                $(this.el).append(htmlToInject);
            }
            else {
                this.addAll();
            };
        },
        addOne: function(model){
            var happeningElement = "<div class='happening-view' happening-id='";
            happeningElement +=  model.get('_id');
            happeningElement += "'>";
            happeningElement += '</div>';
            $(this.el).append(happeningElement);
            var happeningEl = '[happening-id="' + model.get('_id') + '"]';
            var view = new HAPPENING.views.HappeningView({
                model: model,
                el: happeningEl
            });
        },
        addAll: function() {
            var self = this;
            this.collection.each(function(model) {self.addOne(model)});
        }
    }),
    HappeningView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            var self = this;
            var templatize = HAPPENING.utils.templatize;
            var makeDateReadable = function(dateObject) {
                var year = dateObject.getFullYear().toString();
                var month = dateObject.getMonth().toString();
                var day = dateObject.getDate().toString();
                return dateObject.toDateString();
            };
            var happeningHTMLTemplate = '';
            
            happeningHTMLTemplate += '<div class="master-location-view">';
            happeningHTMLTemplate += '<div class="happening-name"><a href="<%=websiteUrl%>"><%=name%></a>'
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="happening-city"><%=city%>'
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="happening-distance">(<%=distanceFromUserLocation%>)';
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="master-date-and-edit-view">';
            happeningHTMLTemplate += '<div class="master-date-view visible">';
            happeningHTMLTemplate += '<span class="happening-date"><%=beginDate%></span>';
            happeningHTMLTemplate += '<span class="happening-to">–</span>';
            happeningHTMLTemplate += '<span class="happening-date"><%=endDate%></span>';
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="select-edit-happening-view invisible">';
            happeningHTMLTemplate += "</div>";
            happeningHTMLTemplate += '</div>';
            var happeningObject = this.model;
            var citySuffix = "";
            if (happeningObject.get("location").countryCode === 'US') {
                citySuffix += happeningObject.get("location").admin1Code;
            }
            else {
                citySuffix += happeningObject.get("location").countryCode;
            };
            var beginDate = happeningObject.get("dates").beginDate;
            var endDate = happeningObject.get("dates").endDate;
            var happeningData = {
                "name": happeningObject.get("name"),
                "beginDate": makeDateReadable(WallTime.UTCToWallTime(beginDate, happeningObject.get('location').timezone)),
                "endDate":  makeDateReadable(WallTime.UTCToWallTime(endDate, happeningObject.get('location').timezone)),
                "city": (happeningObject.get("location").cityName + ', ' + citySuffix),
                "websiteUrl": happeningObject.get("websiteUrl")
            };
            if (HAPPENING.applicationSpace.user.isLocationDefined()) {
                // display the distance OR if it rounds to 0, print it out to one decimal place
                happeningData.distanceFromUserLocation = (Math.floor(happeningObject.distanceFromLocation(HAPPENING.applicationSpace.user.get('currentlyViewedLocation'))) || happeningObject.distanceFromLocation(HAPPENING.applicationSpace.user.get('currentlyViewedLocation')).toFixed(1)).toString() + " miles away";
            };
            // use underscore.js' templating function to create event element
            htmlToInject = templatize(happeningHTMLTemplate, happeningData);
            $(this.el).append(htmlToInject);
            this.selectEditHappeningView = new HAPPENING.views.SubmissionViewSelectorView({
                el: function() {
                    return '[happening-id="' + self.model.get('_id') + '"] .select-edit-happening-view';
                },
                description: 'Edit this Happening',
                model: self.model,
                targetEl: '#happening-edit-container'
            });
        },
        // TODO: figure out why each of these events is firing twice and stop it
        events: {
            mouseenter: 'revealSelectEditHappeningView',
            mouseleave: 'hideSelectEditHappeningView'
        },
        revealSelectEditHappeningView: function() {
            var selectorBase = '[happening-id="' + this.model.get('_id') + '"]';
            $(selectorBase + ' .master-date-view').removeClass('visible');
            $(selectorBase + ' .master-date-view').addClass('invisible');
            $(selectorBase + ' .select-edit-happening-view').removeClass('invisible');
            $(selectorBase + ' .select-edit-happening-view').addClass('visible');
        },
        hideSelectEditHappeningView: function() {
            var selectorBase = '[happening-id="' + this.model.get('_id') + '"]';
            $(selectorBase + ' .select-edit-happening-view').removeClass('visible');
            $(selectorBase + ' .select-edit-happening-view').addClass('invisible');
            $(selectorBase + ' .master-date-view').removeClass('invisible');
            $(selectorBase + ' .master-date-view').addClass('visible');
        }
    }),
    ComparatorSelectorView: Backbone.View.extend({
        selectComparator: function(type, target) {
            HAPPENING.applicationSpace.applicationView.happeningsView.collection.changeComparator(this.options.comparatorConstructor, this.options.target());
            $('.comparator-selector-segment').removeClass('comparator-selected');
            $(this.el).addClass('comparator-selected');
        },
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).empty;
            $(this.el).append(this.options.label);
            $(this.el).addClass('comparator-selector-segment');
        },
        events: {
            click: 'selectComparator'
        }
    }),
    ToolbarView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).empty();
            $(this.el).append('<span id="submit-happening-button"></span>');
            this.submitHappeningButtonView = new HAPPENING.views.SubmissionViewSelectorView({
                el: '#submit-happening-button',
                description: 'Add Happening',
                targetEl: '#happening-submission-container'
            });
        }
    }),
    SubmissionViewSelectorView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).empty();
            $(this.el).html('<span class="submission-view-selector">' + this.options.description + '</span>');
        },
        events: {
            click: 'revealTargetEl'
        },
        revealTargetEl: function() {
            if (this.model !== undefined) {
                this.modifyTargetHappeningSubmissionEl();
            };
            $('.submission-view-modal').removeClass('visible');
            $('.submission-view-modal').addClass('invisible');
            $(this.options.targetEl).addClass('visible');
            $('#modal-underlay').removeClass('invisible');
            $('#modal-underlay').addClass('visible');
        },
        modifyTargetHappeningSubmissionEl: function() {
            var targetSelector = $(this.options.targetEl);
            var targetAppPath = HAPPENING.applicationSpace.applicationView.happeningEditView;
            var happeningModel = this.model;
            // get values to populate input fields with
            var name = happeningModel.get('name');
            var beginDate = happeningModel.get('dates').beginDate.toJSON().split('T')[0];
            var endDate = happeningModel.get('dates').endDate.toJSON().split('T')[0];
            var websiteUrl = happeningModel.get('websiteUrl');
            var cityName = happeningModel.get('location').cityName;
            // populate input fields with values
            targetSelector.find('#name input').val(name);
            targetSelector.find('#begindate input').val(beginDate);
            targetSelector.find('#enddate input').val(endDate);
            targetSelector.find('#cityid input').val(cityName);
            targetSelector.find('#websiteurl input').val(websiteUrl);
            // have to call createTag event to properly populate tags into tag input
            var tagArray = happeningModel.get('tags');
            // clear all tags from the existing element
            targetSelector.find('.tagit').tagit('removeAll');
            // then add new ones one by one
            tagArray.forEach(function(tagString) {
                targetSelector.find('.tagit').tagit('createTag', tagString);
            });
            // get values to store as underlying objects in submission view
            var locationObject = happeningModel.get('location');
            // add underlying objects to submission view
            // populate the location object
            targetAppPath.location = new HAPPENING.models.Location({
                latitude: locationObject.latitude,
                longitude: locationObject.longitude,
                address : {
                    country: locationObject.countryCode,
                    city: locationObject.cityName,
                    cityId: locationObject.cityId,
                },
                timezone: locationObject.timezone
            });
            // populate the theme object
            targetSelector.find('input[type="hidden"]').attr('value', tagArray.join(','));
            // put the happening's full model into the view so we can get the id
            // TODO: keeping all of these separate things in the view is redundant -- we should really just keep the happening model and modify it on the fly, since it has all the relevant info in it
            targetAppPath.model = happeningModel;
        }
    }),
    ModalUnderlayView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).addClass('invisible');
        },
        events: {
            click: 'hideSubmissionViews'
        },
        hideSubmissionViews: function() {
            $('.submission-view-modal').removeClass('visible');
            $('.submission-view-modal').addClass('invisible');
            $(this.el).removeClass('visible');
            $(this.el).addClass('invisible');
        }
    })
};

// namespace for the program
HAPPENING.applicationSpace = {};

// create an instance of HappeningsView (program output)
HAPPENING.applicationSpace.applicationView = new HAPPENING.views.ApplicationView;

// create the User model (program storage)
HAPPENING.applicationSpace.user = new HAPPENING.models.User;

// create the other application views (program input)
HAPPENING.applicationSpace.applicationView.initializeOtherThanHappeningsView();

