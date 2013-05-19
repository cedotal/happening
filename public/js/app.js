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
                    'city': "New York",
                    'country': "USA"
                },
                'latitude': 40.75,
                'longitude': -73.997
            };
        };
        return locationObject;
    }
};

HAPPENING.settings = {
    baseUrl: 'http://' + window.location.hostname + ':3000'
};

HAPPENING.models = {
    User: Backbone.Model.extend({
        defaults: {
            currentlyViewedLocation: undefined,
            currentlyViewedTheme: undefined
        },
        initialize: function() {
            this.on("change:currentlyViewedLocation", function(model) {
                HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
            });
            this.on("change:currentlyViewedTheme", function(model) {
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
    }),
    Theme: Backbone.Model.extend({
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
                return happening.get('dates').beginDate - date;
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
                if (HAPPENING.applicationSpace.user.get("currentlyViewedTheme") !== undefined) {
                    var currentlyViewedThemeId = HAPPENING.applicationSpace.user.get("currentlyViewedTheme").id
                }
                else {
                    var currentlyViewedThemeId = undefined;
                };
                if (currentlyViewedThemeId !== undefined) {
                    requestUrl += '?themeid=';
                    requestUrl += currentlyViewedThemeId;
                };
                return requestUrl;
            };
        }
    })
};

HAPPENING.views = {
    // this master view doesn't actually get rendered, it just renders other views
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
            this.themeSubmissionView = new HAPPENING.views.SubmissionView({
                el: "#theme-submission-container",
                postUrl: "/themes",
                postParameters: [
                    {
                        label: 'What\'s the name of this theme?',
                        id: 'name',
                        type: "string"
                    }
                ],
                resourceName: "theme",
                httpMethod: 'POST',
                header: "Add Theme",
                description: 'Are we missing a theme? Add it here.',
                submitText: 'Add This Theme',
                submitFunction: function() {
                    HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
                }
            });
            this.happeningSubmissionView = new HAPPENING.views.SubmissionView({
                el: "#happening-submission-container",
                postUrl: "/happenings",
                postParameters: [
                    {
                        label: 'What\'s this happening called?',
                        id: "name",
                        type: "string"
                    },
                    {
                        label: 'Where does it take place?',
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
                        label: 'What\'s it all about?',
                        id: "themeid",
                        type: "theme" 
                    },
                    {
                        label: 'What\s the website?',
                        id: "websiteurl",
                        type: "url" 
                    }
                ],
                resourceName: "happening",
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
                postUrl: "/happenings",
                postParameters: [
                    {
                        label: 'What\'s this happening called?',
                        id: "name",
                        type: "string"
                    },
                    {
                        label: 'Where does it take place?',
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
                        label: 'What\'s it all about?',
                        id: "themeid",
                        type: "theme" 
                    },
                    {
                        label: 'What\s the website?',
                        id: "websiteurl",
                        type: "url" 
                    }
                ],
                resourceName: "happening",
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
            $(this.el).append('<div class="comparator-selector-label">Sort By:</div><div id="distance-comparator-selector"></div><div id="date-comparator-selector"></div>');
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
            $(this.el).append('<span class="master-selector-segment">Here are</span>');
            $(this.el).append('<span class="master-selector-segment"  id="theme-selector"></span>');
            $(this.el).append('<span class="master-selector-segment">happenings near</span>');
            $(this.el).append('<span class="master-selector-segment"  id="location-selector"></span>');
            $(this.el).append('<span class="master-selector-segment">.</span>');
            this.themeSearchView = new HAPPENING.views.SearchView({
                el: "#theme-selector",
                addFormElement: true,
                resourceUrl: HAPPENING.settings.baseUrl + '/themes/search',
                processData: function(rawData) {
                    var processedData = [];
                    rawData.forEach(function(rawSingle) {
                        processedSingle = {};
                        processedSingle.label = rawSingle.name;
                        processedSingle.id = rawSingle._id;
                        processedData.push(processedSingle);
                    });
                    processedData.unshift({
                        "label": "All Kinds of",
                        "id": undefined
                    });
                    return processedData;
                },
                selectFunction: function(event, ui) {
                    HAPPENING.applicationSpace.user.set("currentlyViewedTheme", {"id": ui.item.id, "name": ui.item.label});
                }
            });
            this.locationSearchView = new HAPPENING.views.SearchView({
                el: "#location-selector",
                addFormElement: true,
                resourceUrl: HAPPENING.settings.baseUrl + '/cities/search',
                processData: function(rawData) {
                    // TODO: this function doesn't need to be defined twice
                    console.log('391 is the one being used');
                    var processedData = [];
                    rawData.forEach(function(rawSingle) {
                        processedSingle = {};
                           processedSingle.label = rawSingle.name;
                        processedSingle.id = rawSingle["_id"];
                        processedSingle.latitude = rawSingle.latitude;
                        processedSingle.longitude = rawSingle.longitude;
                        processedSingle.country = rawSingle.countryCode;
                        processedData.push(processedSingle);
                    });
                    return processedData;
                },
                selectFunction: function(event, ui) {
                    HAPPENING.applicationSpace.user.set("currentlyViewedLocation", {
                        "latitude": ui.item.latitude, "longitude": ui.item.longitude,
                        'address' : {
                            "country": ui.item.country,
                            "city": ui.item.label
                        }
                    });
                }
            });
            // initial population of theme and location fields
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
            // get user's currently selected theme and convert it into an object that can be passed to selectFunction
            var themeSearchUi = {};
            themeSearchUi.item = {
                id: undefined,
                label: 'All Kinds of'
            };
            // trigger selectFunction for inputs, using appropriate ui objects 
            this.themeSearchView.options.selectFunction(dummyEvent, themeSearchUi);
            this.locationSearchView.options.selectFunction(dummyEvent, locationSearchUi);
            // the jQuery mobile autocomplete module doesn't change input element values when a select event is called manually, so we do it ourselves here
            $(this.themeSearchView.el).find('input').val(themeSearchUi.item.label);
            $(this.locationSearchView.el).find('input').val(locationSearchUi.item.label);
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
            $(this.el).find("input").autocomplete({
                source: function(request, response) {
                    var searchString = request.term;
                    var rawData = HAPPENING.utils.makeHttpRequest(self.options.resourceUrl + '?searchstring=' + searchString);
                    var processedData = self.options.processData(rawData);
                    response(processedData);
                },
                autoFocus: true,
                select: self.options.selectFunction
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
                    $(self.el).find("#" + postParameter.id).append(postParameter.label + "<input type='text' name='" + postParameter.id + "'></input>");
                    $(self.el).find("#" + postParameter.id + " input").datepicker({
                        dateFormat: "yy-mm-dd"
                    });
                },
                theme: function(postParameter) {
                    self.themeInputView = new HAPPENING.views.SearchView({
                        el: function() {
                            return "#" + $(self.el).attr('id') + " #" + postParameter.id;
                        },
                        description: postParameter.label,
                        resourceUrl: HAPPENING.settings.baseUrl + '/themes/search',
                        processData: function(rawData) {
                            var processedData = [];
                            rawData.forEach(function(rawSingle) {
                                processedSingle = {};
                                processedSingle.label = rawSingle.name;
                                processedSingle.id = rawSingle["_id"];
                                processedData.push(processedSingle);
                            });
                            return processedData;
                        },
                        selectFunction: function(event, ui) {
                            self.theme = new HAPPENING.models.Theme({
                                id: ui.item.id,
                                name: ui.item.label
                            });
                        }
                    });
                },
                location: function(postParameter) {
                    self.locationInputView = new HAPPENING.views.SearchView({
                        el: function() {
                            return "#" + $(self.el).attr('id') + " #" + postParameter.id;
                        },
                        description: postParameter.label,
                        resourceUrl: HAPPENING.settings.baseUrl + '/cities/search',
                        processData: function(rawData) {
                            var processedData = [];
                            rawData.forEach(function(rawSingle) {
                                processedSingle = {};
                                processedSingle.label = rawSingle.name;
                                processedSingle.cityId = rawSingle.geonameID;
                                processedSingle.latitude = rawSingle.latitude;
                                processedSingle.longitude = rawSingle.longitude;
                                processedSingle.country = rawSingle.countryCode;
                                processedData.push(processedSingle);
                            });
                            return processedData;
                        },
                        selectFunction: function(event, ui) {
                            self.location = new HAPPENING.models.Location({
                                "latitude": ui.item.latitude,
                                "longitude": ui.item.longitude,
                                'address' : {
                                    "country": ui.item.country,
                                    "city": ui.item.label,
                                    "cityId": ui.item.cityId
                                }
                            });
                        }
                    });
                },
                _misc: function(postParameter) {
                    $(self.el).find("#" + postParameter.id).append(postParameter.label + "<input type='text' name='" + postParameter.id + "'></input>");
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
                    return objectIdRegExp.test(parameter);
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
                $(self.el).find("form").append("<div id='" + postParameter.id + "'></div>");
                if (inputConstructionFunctions[postParameter.type] !== undefined) {
                    inputConstructionFunctions[postParameter.type](postParameter);
                }
                else {
                    inputConstructionFunctions['_misc'](postParameter);
                };
            });
            // functions for fetching the parameter value when assembling a request url
            var inputParameterGetters = {
                themeid: function(postParameter) {
                    return self.theme.id;
                },
                cityid: function(postParameter) {
                    return self.location.get("address").cityId;
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
                        if ($(self.el).find("#" + postParameter.id + " input").val() === undefined || $(self.el).find("#" + postParameter.id + " input").val() === "") {
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
                    console.log(self.location);
                    var postRequest = HAPPENING.settings.baseUrl + self.options.postUrl + "?";
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
                    console.log('httpMethod: ' + self.options.httpMethod);
                    console.log(postRequest);     
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
        // TODO: happenings should really be their own views
        render: function() {
            console.log('rendering happeningsView');
            var self = this;
            $(this.el).empty();
            var htmlToInject = "";
            if (this.collection.length === 0) {
                htmlToInject = "There don't seem to be any happenings for that theme!";
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
            happeningHTMLTemplate += '<div class="happening-name"><a href="<%=websiteUrl%>" target="_blank"><%=name%></a>'
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="happening-city"><%=city%>'
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="happening-distance">(<%=distanceFromUserLocation%>)';
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="master-date-and-edit-view">';
            happeningHTMLTemplate += '<div class="master-date-view visible">';
            happeningHTMLTemplate += '<span class="happening-date"><%=beginDate%></span>';
            happeningHTMLTemplate += '<span class="happening-to">to</span>';
            happeningHTMLTemplate += '<span class="happening-date"><%=endDate%></span>';
            happeningHTMLTemplate += '</div>';
            happeningHTMLTemplate += '<div class="select-edit-happening-view invisible">';
            happeningHTMLTemplate += "</div>";
            happeningHTMLTemplate += '</div>';
            var happeningObject = this.model;
            var happeningData = {
                "name": happeningObject.get("name"),
                "beginDate": makeDateReadable(happeningObject.get("dates").beginDate),
                "endDate":  makeDateReadable(happeningObject.get("dates").endDate),
                "city": happeningObject.get("location").cityName,
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
                happeningModel: self.model,
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
            $(this.el).append('<span id="submit-theme-button"></span>');
            $(this.el).append('<span id="submit-happening-button"></span>');
            // $(this.el).append('<span id="link-copier"></span>');
            this.submitThemeButtonView = new HAPPENING.views.SubmissionViewSelectorView({
                el: '#submit-theme-button',
                description: 'Submit Theme',
                targetEl: '#theme-submission-container'
            });
            this.submitHappeningButtonView = new HAPPENING.views.SubmissionViewSelectorView({
                el: '#submit-happening-button',
                description: 'Submit Happening',
                targetEl: '#happening-submission-container'
            });
            /* this.linkCopierView = new HAPPENING.views.LinkCopierView({
                el: '#link-copier'
            }); */
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
            if (this.options.happeningModel !== undefined) {
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
            var happeningModel = this.options.happeningModel;
            // get values to populate input fields with
            var name = happeningModel.get('name');
            var beginDate = happeningModel.get('dates').beginDate.toJSON().split('T')[0];
            var endDate = happeningModel.get('dates').endDate.toJSON().split('T')[0];
            var websiteUrl = happeningModel.get('websiteUrl');
            var themeName = happeningModel.get('themes')[0].name;
            var cityName = happeningModel.get('location').cityName;
            // populate input fields with values
            targetSelector.find('#name input').val(name);
            targetSelector.find('#begindate input').val(beginDate);
            targetSelector.find('#enddate input').val(endDate);
            targetSelector.find('#cityid input').val(cityName);
            targetSelector.find('#websiteurl input').val(websiteUrl);
            targetSelector.find('#themeid input').val(themeName);
            // get values to store as underlying objects in submission view
            var locationObject = happeningModel.get('location');
            var themeObject = happeningModel.get('themes')[0];
            // add underlying objects to submission view
            // populate the location object
            targetAppPath.location = new HAPPENING.models.Location({
                latitude: locationObject.latitude,
                longitude: locationObject.longitude,
                address : {
                    country: locationObject.countryCode,
                    city: locationObject.cityName,
                    cityId: locationObject.cityId
                }
            });
            // populate the theme object
            targetAppPath.theme = new HAPPENING.models.Theme({
                name: themeObject.name,
                _id: themeObject._id
            });
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
    /*
    ,
    // TODO: clipboarding manipluation is diffic    ult, maybe use: https://github.com/jonrohan/ZeroClipboard
    LinkCopierView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        events: {
            'click' : 'copyLink'
        },
        copyLink: function() {
            var currentUrl = Backbone.history.location.href;
            console.log(currentUrl);
        },
        render: function() {
            $(this.el).empty();
            $(this.el).append('copy link');
        }
    })
    */
};

/*

// TODO: handle initial urls with theme suffixes
HAPPENING.Router = Backbone.Router.extend({
    routes: {
        "/": "test"
    },
    test: function() {
        console.log('theme test triggered');
    }
});

Backbone.history.start({
    pushState: true
});

*/

// namespace for the program
HAPPENING.applicationSpace = {};

// create an instance of HappeningsView (program output)
HAPPENING.applicationSpace.applicationView = new HAPPENING.views.ApplicationView;

// create the User model (program storage)
HAPPENING.applicationSpace.user = new HAPPENING.models.User;

// create the other application views (program input)
HAPPENING.applicationSpace.applicationView.initializeOtherThanHappeningsView();
