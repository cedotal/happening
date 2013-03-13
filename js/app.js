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
        result = $.parseJSON(result);
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
        // try the W3C standard API, which requires the user to actively approve
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
        };
        // if none of our location-finding methods work, everything in the object starts as null
        return locationObject;
    },
    // gets a particular parameter's value from the url
    getUrlParameter: function(name) {
        return decodeURI(
            (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
        );
    },
    // function that repeatedly checks whether a value is set, performs a success callback when it's done, and performs a failure callback when it exceeds the timeout value; right now, interval and timeout values are hardcoded 
    checkForValueRepeatedly: function(valuesToCheck, successCallback, failureCallback) {
        var counter = 0;
        var repeatedCheckFunction = function() {
            var definitionCheckArray = [];
            valuesToCheck.forEach(function(valueToCheck) {
                if (typeof valueToCheck === null || typeof valuesToCheck === undefined) {
                    definitionCheckArray.push(false);
                };
            });
            if (!_.contains(definitionCheckArray, false)) {
                successCallback();
                clearInterval(timer);
            }
            else if (counter >= 25) {
                failureCallback();
            }
            else {
                counter++;
            };
        };
        var timer = setInterval(repeatedCheckFunction, 200);
    }
};

HAPPENING.settings = {
    baseUrl: "http://localhost:8888"
};

HAPPENING.models = {
    User: Backbone.Model.extend({
        // on creation, try to populate theme and location preference
        defaults: {
            currentlyViewedLocation: HAPPENING.utils.findCurrentUserLocation(),
            currentlyViewedTheme: {
                "name": null,
                "id": null
            }
        },
        initialize: function() {
            this.on("change:currentlyViewedLocation", function(model) {
                console.log("changed location");
                HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch();
                HAPPENING.applicationSpace.applicationView.locationView.locationDisplayView.render();
            });
            this.on("change:currentlyViewedTheme", function(model) {
                console.log("changed theme");
                HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch();
                HAPPENING.applicationSpace.applicationView.themeView.themeDisplayView.render();
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
        distanceFromCurrentlyViewedLocation: function() {
            var distanceFromCurrentlyViewedLocation = HAPPENING.utils.calculateDistance(this.get("location").latitude, this.get("location").longitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").latitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").longitude);
            return distanceFromCurrentlyViewedLocation;
        }
    })
};

HAPPENING.collections = {
    HappeningCollection: Backbone.Collection.extend({
        model: HAPPENING.models.Happening,
        // the comparator function determines sorting
        comparator: function(happening){
            return happening.distanceFromCurrentlyViewedLocation();
        },
        // TODO: when a theme has been chosen by the user, the app needs to make the call to the API that just gets ones of that theme, rather than retreiving all and parsing client-side
        initialize: function() {
            var self = this;
            // if theme is defined, checkRepeatedly to see if location and/or theme are defined. successCallback is to render, failureCallback is to output a message asking for both theme and location
            this.url = HAPPENING.settings.baseUrl + "/happenings";
            var successCallback = function() {
                self.fetch();
            };
            var failureCallback = function() {};
            HAPPENING.utils.checkForValueRepeatedly([HAPPENING.applicationSpace.user.get("currentlyViewedLocation").latitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").longitude], successCallback, failureCallback);
        },
        parse: function(response) {
            // get the currently set theme
            var currentTheme = HAPPENING.applicationSpace.user.get("currentlyViewedTheme").id;
            // check to see if a theme is defined; if it is, filter results by it
            if (!isNaN(currentTheme) && currentTheme !== null && currentTheme !== undefined) {
                response = response.filter( function(happening) {
                    if (_.contains(happening.themes, currentTheme)) {
                        return true;
                    };
                });
            };
            this.sort();
            return response;
        }
    })
};

HAPPENING.views = {
    // this master view doesn't actually get rendered, it just renders other views
    ApplicationView: Backbone.View.extend({
        initialize: function() {
            // initialize (and self-render) all the necessary views
            this.locationView = new HAPPENING.views.LocationView({
                el: "#user-location"
            });
            this.themeView = new HAPPENING.views.ThemeView({
                el: "#theme-selector"
            });
            this.happeningsView = new HAPPENING.views.HappeningsView({
                el: "#happenings-container"
            });
            this.themeSubmissionView = new HAPPENING.views.SubmissionView({
                el: "#theme-submission-container"
            });
        }
    }),
    // a generic view for autocomplete-enabled search input view. on creation, it needs to have three things passed to it through options: its el, a destination URL for retreiving autosuggest data, a function for turning the data from the URL into the [{label: "foo", value: "bar"}] format that jQuery UI uses, a description attribute that gets inserted into the element
    SearchView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            var self = this;
            $(this.el).append("<div><form>" + this.options.description + "<input type='text'></input></form></div>");
            var rawData = HAPPENING.utils.makeHttpRequest(this.options.requestUrl);
            var processedData = this.options.resultProcessor(rawData);
            $(this.el).find("input").autocomplete({
                source: processedData,
                autoFocus: true,
                select: function(event, ui) {
                    console.log(ui.toSource());
                    HAPPENING.applicationSpace.user.set("currentlyViewedTheme", {"id": parseInt(ui.item.id), "name": ui.item.label});
                }
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
            $(this.el).html("<div>Submit a new theme here:<form><input type='text'></input><input type='submit' value='Add'></input></form></div>");
            $(this.el).find("form").on("submit", function(event) {
                // stop the automatic page reload upon form submission
                event.preventDefault();
                // get the value entered into the form so that it can be used to create a resource
                var themeName = $(self.el).find("input[type='text']").val();
                console.log(themeName);
                // TODO: why is this request failing?
                var postResponse = HAPPENING.utils.makeHttpRequest(HAPPENING.settings.baseUrl + "/themes?themename=" + themeName, "POST");
            });
        }
    }),
    LocationView: Backbone.View.extend({
        // view renders when created
        initialize: function() {
            this.render();
            this.locationSearchView = new HAPPENING.views.SearchView({
                el: "#location-search",
                description: "Select a new location here:",
                requestUrl: HAPPENING.settings.baseUrl + '/cities/search',
                resultProcessor: function(rawData) {
                    var processedData = [];
                    rawData.forEach(function(rawSingle) {
                        processedSingle = {};
                        processedSingle.label = rawSingle.name;
                        processedSingle.latitude = rawSingle.latitude;
                        processedSingle.longitude = rawSingle.longitude;
                        processedData.push(processedSingle);
                    });
                    return processedData;
                }
            });
        },
        // renders the location view
        render: function() {
            var renderElement = this.el;
            $(renderElement).empty();
            $(renderElement).append("It looks like you're in: [LOADING ANIMATION]");
            var htmlToInject = "";
            var successCallback = function() {
                $(renderElement).empty();
                $(renderElement).append("Finding happenings near: " + HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.city + ", " + HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.country);
                $(renderElement).append("<div id=\"location-search\"></div>");
            };
            var failureCallback = function() {
                $(renderElement).empty();
                $(renderElement).append("We can't seem to detect your location. Please enter one below.");
                $(renderElement).append("<div id=\"location-search\"></div>");
            };
            HAPPENING.utils.checkForValueRepeatedly([HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.city, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.country], successCallback, failureCallback);
        }
    }),
    HappeningsView: Backbone.View.extend({
        initialize: function() {
            // append a loading animation to tide us over until the collection resets
            $(this.el).html("[LOADING ANIMATION]");
            // create a new collection, which will fetch models and trigger a redraw of this view ehn
            this.collection = new HAPPENING.collections.HappeningCollection();
            // set this view to render whenever its collection resets
            this.listenTo(this.collection, 'reset', this.render);
        },
        // TODO: happenings should really be their own views
        render: function() {
            console.log("happeningsView rendering");
            console.log("what render is working from");
            console.log(this.collection.models.map(function(model) { return model.get("name") }));
            var self = this;
            var htmlToInject = "";
            if (this.collection.length === 0) {
                htmlToInject = "There don't seem to be any happenings!";
            }
            else {
                var templatize = HAPPENING.utils.templatize;
                var happeningHTMLTemplate = "<div><%=beginDate%> to <%=endDate%><%=name%><%=city%>(<%=distanceFromUserLocation%>)</div>";
                _(self.collection.models).each(function(happeningObject) {
                    var happeningData = {
                        "name": happeningObject.get("name"),
                        "beginDate": happeningObject.get("dates").beginDate,
                        "endDate": happeningObject.get("dates").endDate,
                        "city": happeningObject.get("location").address.city
                    };
                    if (HAPPENING.applicationSpace.user.isLocationDefined()) {
                        happeningData.distanceFromUserLocation = Math.floor(happeningObject.distanceFromCurrentlyViewedLocation()).toString() + " miles away";
                    };
                    // use underscore.js' templating function to create event element
                    htmlToInject += templatize(happeningHTMLTemplate, happeningData);
                });
            };
            $(this.el).html(htmlToInject);
        }
    }),
    ThemeView: Backbone.View.extend({
        // view renders when created
        initialize: function() {
            this.render();
            this.themeDisplayView = new HAPPENING.views.ThemeDisplayView({
                el: "#theme-display"
            });
            this.themeSearchView = new HAPPENING.views.SearchView({
                el: "#theme-search",
                description: "Select a new theme here:",
                requestUrl: HAPPENING.settings.baseUrl + '/themes',
                resultProcessor: function(rawData) {
                    var processedData = [];
                    rawData.forEach(function(rawSingle) {
                        processedSingle = {};
                        processedSingle.label = rawSingle.name;
                        processedSingle.id = rawSingle.id;
                        processedData.push(processedSingle);
                    });
                    return processedData;
                }
            });
        },
        // create fixtures for sub-views
        render: function() {
            $(this.el).empty();
            $(this.el).append("<div id=\"theme-display\"></div>");
            $(this.el).append("<div id=\"theme-search\"></div>");
        }
    }),
    ThemeDisplayView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).empty();
            this.currentlyViewedTheme = HAPPENING.applicationSpace.user.get("currentlyViewedTheme");
            themeHtml = "";
            if (typeof this.currentlyViewedTheme.id === null || typeof this.currentlyViewedTheme.id === undefined || isNaN(parseFloat(this.currentlyViewedTheme.id))) {
                themeHtml = "Please select a theme.";
            }
            else {
                themeHtml = "You've selected the following theme: " + this.currentlyViewedTheme.name;
            };
            $(this.el).append(themeHtml);
        }
    })
};

// the actual program that makes things happen
HAPPENING.applicationSpace = {};

HAPPENING.applicationSpace.user = new HAPPENING.models.User;

HAPPENING.applicationSpace.applicationView = new HAPPENING.views.ApplicationView;

