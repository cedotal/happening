var HAPPENING = {};

// utility functions
HAPPENING.utils = {
    // a function that accepts a latitude and longitude and returns the distance between that location and the event's location in kilometers; note that this uses the haversine formula rather than Vincenty's fomulae for two reasons: 1) performance, and 2) what matters to the user is comparative distances rather than absolute distances
    calculateDistance: function(lat1, lon1, lat2, lon2) {
        // we need strict checking of values passed in because 0 is an acceptable value for any of these, but undefined and null are not
        if (typeof lat1 === undefined || typeof lat1 === null || typeof lon1 === undefined || typeof lon1 === null || typeof lat2 === undefined || typeof lat2 === null || typeof lon2 === undefined || typeof lon2 === null) {
            throw {
                "name": "invalid arguments to calculateDistance()",
                "message": "one or more of the arguments to calculateDistance(), which should all be latitude or longitude values, is invalid"
            }
        }
        // radius of the Earth (approximated sphere) in km
        var radius = 6371;
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
    // function that accepts a url and returns the result of an API call; currently only handles JSON
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
    // a function that goes through various methods, attempting to figure out where the user is, until one works; if none work, a location object is returned will all of its non-object attributes set to null
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
        // first, try to use google's location API, which doesn't require the user to actively approve the location-sharing
        if (google.loader.ClientLocation !== undefined && google.loader.ClientLocation !== null) {
            locationObject.address.city = google.loader.ClientLocation.address.city,
            locationObject.address.country = google.loader.ClientLocation.address.country,
            locationObject.latitude = google.loader.ClientLocation.latitude,
            locationObject.longitude = google.loader.ClientLocation.longitude;
        }
        // try the W3C standard API for geolocation, which requires the user to respond "yes" to sharing their location 
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
    // function that repeatedly checks whether a value is set , performs a success callback when it's done, and performs a failure callback when it exceeds the timeout value; right now, interval and timeout values are hardcoded 
    checkForValueRepeatedly: function(valueToCheck, successCallback, failureCallback) {
        var counter = 0;
        var repeatedCheckFunction = function() {
            if (typeof valueToCheck === null || typeof valueToCheck === undefined) {
                successCallback();
                clearInterval(timer);
            }
            else if (counter >= 20) {
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
        // when we first create a user model, we attempt to populate both the theme and location preference
        defaults: {
            currentlyViewedLocation: HAPPENING.utils.findCurrentUserLocation(),
            currentlyViewedTheme: parseInt(HAPPENING.utils.getUrlParameter("theme"))
        }
    }),
    // nothing special yet for the creation of happening models
    Happening: Backbone.Model.extend()
};

HAPPENING.collections = {
    HappeningCollection: Backbone.Collection.extend({
        model: HAPPENING.models.Happening,
        // the comparator function determines what function is used when this collection gets sorted
        comparator: function(happening){
            return HAPPENING.utils.calculateDistance(happening.get("location").latitude, happening.get("location").longitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").latitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").longitude) 
        },
        // reset the viewable collections according to the user's filter preferences
        reset: function() {
            var self = this;
            var makeApiCall = HAPPENING.utils.makeApiCall;
            var happeningsResult = makeApiCall('js/happenings-data.js');
                        
            // filter happenings by theme
            happeningsResult = happeningsResult.filter(function(happening) {
                if (_.contains(happening.themes, HAPPENING.applicationSpace.user.get("currentlyViewedTheme"))) {
                    return true;
                };
            });
            // then add each one to the collection
            happeningsResult.forEach(function(happening) {
                self.add(happening);
            });
        }
    })
};

HAPPENING.views = {
    ApplicationView: Backbone.View.extend({
        // this master view doesn't actually get rendered, it just renders other views
        el: null,
        initialize: function() {
            // initialize (and self-render) all the necessary views
            this.locationView = new HAPPENING.views.LocationView();
            this.themeView = new HAPPENING.views.ThemeView();
            this.happeningsView = new HAPPENING.views.HappeningsView();
        }
    }),
    LocationView: Backbone.View.extend({
        el: "#user-location",
        // view renders when created
        initialize: function() {
            this.render();
        },
        // renders the location view
        // TODO: make this "check for a value and wait to do a thing until that value appears" into a generic function
        render: function() {
            var renderElement = this.el;
            $(renderElement).empty();
            $(renderElement).append("It looks like you're in:");
            var testLocationPresence = function() {
                var self = this;
                if (HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.city && HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.country) {
                    $(renderElement).append(HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.city + ", " + HAPPENING.applicationSpace.user.get("currentlyViewedLocation").address.country);
                    clearInterval(timer);
                };
            };
            var timer = setInterval(testLocationPresence, 200);
        }
    }),
    ThemeView: Backbone.View.extend({
        el: "#theme-selector",
        // view renders when created
        initialize: function() {
            this.render();
        },
        // TODO: this function is not handling an undefined "theme" parameter properly
        render: function() {
            this.currentlyViewedTheme = HAPPENING.applicationSpace.user.get("currentlyViewedTheme");
            themeHtml = "";
            console.log(typeof this.currentlyViewedTheme);
            if (typeof this.currentlyViewedTheme === null || typeof this.currentlyViewedTheme === undefined || typeof this.currentlyViewedTheme === NaN) {
                themeHtml = "You don't seem to have a theme selected!";
            }
            else {
                
                themeHtml = "Here are some happenings with a theme ID of: " + this.currentlyViewedTheme;
            };
            $(this.el).append(themeHtml);
        }
    }),
    HappeningsView: Backbone.View.extend({
        el: "#happenings-container",
        initialize: function() {
            this.collection = new HAPPENING.collections.HappeningCollection;
            this.collection.reset();
            this.render();
        },
        render: function() {
            var htmlToInject = "";
            if (this.collection.length > 0) {
                var calculateDistance = HAPPENING.utils.calculateDistance;
                var templatize = HAPPENING.utils.templatize;
                var happeningHTMLTemplate = "<div><%=beginDate%> to <%=endDate%><%=name%><%=city%>(<%=distanceFromUserLocation%> km)</div>";
                _(this.collection.models).each(function(happeningObject) {
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
            $(this.el).append(htmlToInject);
        }
    })
};

HAPPENING.applicationSpace = {};

HAPPENING.applicationSpace.user = new HAPPENING.models.User;

window.setTimeout( function() {HAPPENING.applicationSpace.applicationView = new HAPPENING.views.ApplicationView; }, 1000);

//HAPPENING.applicationSpace.applicationView = new HAPPENING.views.ApplicationView
