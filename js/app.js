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
    // accepts a url and returns result of an API call
    makeApiCall: function(url) {
        var result;
        $.ajax({
            async: false,
            url: url
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
                var reverseLookupResponse = HAPPENING.utils.makeApiCall(openStreetMapUrl);
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

HAPPENING.models = {
    User: Backbone.Model.extend({
        // on creation, try to populate theme and location preference
        defaults: {
            currentlyViewedLocation: HAPPENING.utils.findCurrentUserLocation(),
            currentlyViewedTheme: parseInt(HAPPENING.utils.getUrlParameter("theme"))
        },
        initialize: function() {
            this.on("change:currentlyViewedLocation", function(model) {
                console.log("changed location");
                HAPPENING.applicationSpace.applicationView.happeningsView.render();
            });
            this.on("change:currentlyViewedTheme", function(model) {
                console.log("changed theme");
                HAPPENING.applicationSpace.applicationView.happeningsView.render();
            });
        }
    }),
    Happening: Backbone.Model.extend(),
    AutosuggestResult: Backbone.Model.extend({})
};

HAPPENING.collections = {
    HappeningCollection: Backbone.Collection.extend({
        model: HAPPENING.models.Happening,
        // the comparator function determines sorting
        comparator: function(happening){
            return HAPPENING.utils.calculateDistance(happening.get("location").latitude, happening.get("location").longitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").latitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").longitude) 
        },
        // reset the viewable collections according to the user's filter preferences
        reset: function() {
            var self = this;
            this.models = [];
            var makeApiCall = HAPPENING.utils.makeApiCall;
            var happeningsResult = makeApiCall('js/happenings-data.js');
            console.log("resetting HappeningCollection");
            console.log("initial happenings themeArrays");
            console.log(happeningsResult.map(function(result){return result.themes;}));
            // filter happenings by theme
            happeningsResult = happeningsResult.filter(function(happening) {
                if (_.contains(happening.themes, HAPPENING.applicationSpace.user.get("currentlyViewedTheme").ID)) {
                    return true;
                };
            });
            console.log("post-filtering happenings themeArrays");
            console.log(happeningsResult.map(function(result){return result.themes;}));
            // then add each one to the collection
            happeningsResult.forEach(function(happening) {
                self.add(happening);
            });
        }
    }),
    AutosuggestResultCollection: Backbone.Collection.extend({
        model: HAPPENING.models.AutosuggestResult,
        // keep autosuggest results sorted in alphabetical order
        comparator: function(autosuggestResult) {
            return autosuggestResult.get("name");
        },
        reset: function(searchString) {
            this.models = [];
            var self = this;
            var makeApiCall = HAPPENING.utils.makeApiCall;
            var autosuggestResults = makeApiCall('js/themes-data.js');
            // filter happenings by beginning of name 
            autosuggestResults = autosuggestResults.filter(function(autosuggestResult) {
                if (autosuggestResult.name.substring(0, searchString.length).toLowerCase() === searchString.toLowerCase()) {
                    return true;
                };
            });
            // then add each one to the collection
            autosuggestResults.forEach(function(autosuggestResult) {
                self.add(autosuggestResult);
            });
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
        }
    }),
    LocationView: Backbone.View.extend({
        // view renders when created
        initialize: function() {
            this.render();
        },
        // renders the location view
        render: function() {
            var renderElement = this.el;
            $(renderElement).empty();
            $(renderElement).append("It looks like you're in: [LOADING ANIMATION]");
            var htmlToInject = "";
            var successCallback = function() {
                $(renderElement).empty();
                $(renderElement).append("It looks like you're in: " + HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.city + ", " + HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.country);
            };
            var failureCallback = function() {
                $(renderElement).empty();
                $(renderElement).append("We can't seem to detect your location.");
            };
            HAPPENING.utils.checkForValueRepeatedly([HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.city, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.country], successCallback, failureCallback);
        }
    }),
    HappeningsView: Backbone.View.extend({
        initialize: function() {
            this.collection = new HAPPENING.collections.HappeningCollection();
            this.render();
        },
        // TODO: happenings should really be their own views
        render: function() {
            console.log("HappeningsView rendering");
            this.collection.reset();
            var self = this;
            $(this.el).append("[LOADING ANIMATION]");
            var htmlToInject = "";
            var successCallback = function() {
                if (self.collection.length > 0) {
                    var calculateDistance = HAPPENING.utils.calculateDistance;
                    var templatize = HAPPENING.utils.templatize;
                    self.collection.reset();
                    var happeningHTMLTemplate = "<div><%=beginDate%> to <%=endDate%><%=name%><%=city%>(<%=distanceFromUserLocation%> miles)</div>";
                    _(self.collection.models).each(function(happeningObject) {
                        var happeningData = {
                        "name": happeningObject.get("name"),
                        "beginDate": happeningObject.get("dates").beginDate,
                        "endDate": happeningObject.get("dates").endDate,
                        "distanceFromUserLocation": Math.floor(calculateDistance(happeningObject.get("location").latitude, happeningObject.get("location").longitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").latitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").longitude)),
                        "city": happeningObject.get("location").address.city
                        };
                        // use underscore.js' templating function to create event element
                        htmlToInject += templatize(happeningHTMLTemplate, happeningData);
                    });
                }
                else {
                    htmlToInject = "there are no happenings :(";
                };
                $(self.el).empty();
                $(self.el).append(htmlToInject);
            };
            var failureCallback = function() {
                htmlToInject = "Please enter your location to see happenings.";
                $(self.el).empty();
                $(this.el).append(htmlToInject);
            };
            HAPPENING.utils.checkForValueRepeatedly([HAPPENING.applicationSpace.user.get("currentlyViewedLocation").latitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").longitude], successCallback, failureCallback);
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
                el: "#theme-search"
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
            this.currentlyViewedTheme = HAPPENING.applicationSpace.user.get("currentlyViewedTheme");
            themeHtml = "";
            if (typeof this.currentlyViewedTheme === null || typeof this.currentlyViewedTheme === undefined ||  isNaN(parseFloat(this.currentlyViewedTheme))) {
                themeHtml = "Please select a theme to see happenings.";
            }
            else {
                themeHtml = "You've selected the following theme: " + this.currentlyViewedTheme;
            };
            $(this.el).append(themeHtml);
        }
    }),
    // el must be set at creation to render properly
    SearchView: Backbone.View.extend({
        initialize: function() {
            // TODO: the below two els are not being passed properly to their objects when said objects are created
            this.render();
            this.searchFormView = new HAPPENING.views.SearchFormView({
                el: "#theme-search-form"
            });
            this.autosuggestResultsView = new HAPPENING.views.AutosuggestResultsView({
                el: "#theme-autosuggest-area"
            });
        },
        render: function() {
            $(this.el).empty();
            $(this.el).append("<div id=\"theme-search-form\"></div>");
            $(this.el).append("<div id=\"theme-autosuggest-area\"></div>");
        },
        // 1. keypress 2. enter-submit checking 3. keyup 4. value update
        events: {
            'submit form': 'enterFilter',
            'keyup input': 'inputHandler',
            'focus input': 'inputHandler',
            'blur input': 'blurHandler'
        },
        // the sole purpose of this event is to prevent the page from reloading on a submission
        enterFilter: function() {
            return false;
        },
        // if the key pressed is "enter" then do a search submission; otherwise, repopulate with matching autosuggest results
        inputHandler: function(event) {
            if (event.keyCode === 13) {
                this.searchSubmitHandler();
            }
            else {
                this.autosuggestResultsHandler();
            };
        },
        autosuggestResultsHandler: function() {
            var searchString = $(this.el).find("input").val();
            this.autosuggestResultsView.render(searchString);
        },
        searchSubmitHandler: function() {
            this.blurHandler();
            HAPPENING.applicationSpace.user.set({
                "currentlyViewedTheme": {
                    "ID": 4,
                    "name": "Engineering"
                }
            });
        },
        blurHandler: function() {
            this.autosuggestResultsView.render(null);
        }
    }),
    SearchFormView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).empty();
            $(this.el).html("<form><input type='text'></form>");
        }
    }),
    AutosuggestResultsView: Backbone.View.extend({
        initialize: function() {
            this.collection = new HAPPENING.collections.AutosuggestResultCollection();
        },
        render: function(searchString) {
            var self = this;
            if (searchString === null) {
                $(self.el).empty();
            }
            else {
                this.collection.reset(searchString);
                $(self.el).empty();
                this.collection.models.forEach(function(model) {
                    $(self.el).append("<div>" + model.get("name") + "</div>");
                });
            };
        }
    }),
    // TODO add this to make mouseOver events work properly
    AutosuggestResultView: Backbone.View.extend({
        tagName: 'div',
        events: {
            'mouseover div': function() { console.log("mouseover";) }
        },
        initialize: function(
        ),
        render: function() {
            $(this.el).html("an autosuggest result!")
        }
    })
};

// the actual program that makes things happen
HAPPENING.applicationSpace = {};

HAPPENING.applicationSpace.user = new HAPPENING.models.User;

HAPPENING.applicationSpace.applicationView = new HAPPENING.views.ApplicationView;

