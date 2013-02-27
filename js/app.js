var HAPPENING = {};

// utility functions
HAPPENING.utils = {
    calculateDistance: function(lat1, lon1, lat2, lon2) {
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
    templatize: function(templateString, templateDataObject) {
        var htmlConstructor = _.template(templateString);
        return htmlConstructor(templateDataObject);
    },
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
        // first, try to use google's non-intrusive location API
        if (google.loader.ClientLocation !== undefined && google.loader.ClientLocation !== null) {
            locationObject.address.city = google.loader.ClientLocation.address.city,
            locationObject.address.country = google.loader.ClientLocation.address.country,
            locationObject.latitude = google.loader.ClientLocation.latitude,
            locationObject.longitude = google.loader.ClientLocation.longitude;
        }
        // if google's location API doesn't work, try the W3C standard API for geolocation, which requires the user to respond "yes" to sharing their location 
        else if (typeof navigator.geolocation.getCurrentPosition !== undefined) {
            // the navigation API can only give us lat and long...
            navigator.geolocation.getCurrentPosition(
            // first argument is the success function
            function(position) {
                // so we have to use them to perform a reverse lookup
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
    getUrlParameter: function(name) {
        return decodeURI(
            (RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
        );
    },
    getThemeFromUrl: function() {
        currentUrlTheme = parseInt(this.getUrlParameter('theme'));
        // TODO: this needs error throwing
        return currentUrlTheme;
    }
};

HAPPENING.models = {
    User: Backbone.Model.extend({
        defaults: {
            currentlyViewedLocation: HAPPENING.utils.findCurrentUserLocation(),
            currentlyViewedTheme: HAPPENING.utils.getThemeFromUrl()
        }
    }),
    Happening: Backbone.Model.extend()
};

HAPPENING.collections = {
    HappeningCollection: Backbone.Collection.extend({
        model: HAPPENING.models.Happening,
        comparator: function(happening){
            return HAPPENING.utils.calculateDistance(happening.attributes.location.latitude, happening.attributes.location.longitude, HAPPENING.applicationSpace.user.attributes.currentlyViewedLocation.latitude, HAPPENING.applicationSpace.user.attributes.currentlyViewedLocation.longitude) 
        },
        reset: function() {
            var self = this;
            var makeApiCall = HAPPENING.utils.makeApiCall;
    
            // convert result from string to object
            var happeningsResult = makeApiCall('js/happenings-data.js');
                        
            // filter happenings by theme
            happeningsResult = happeningsResult.filter(function(happening) {
                if (_.contains(happening.themes, HAPPENING.applicationSpace.user.get("currentlyViewedTheme"))) {
                    return true;
                };
            });
                        
            happeningsResult.forEach(function(happening) {
                self.add(happening);
            });
        }
    })
};

HAPPENING.views = {
    locationView: Backbone.View.extend({
        el: "#user-location",
        initialize: function() {
        }
    }),
    themeView: Backbone.View.extend({
        el: "#theme-selector",
        initialize: function() {
        }
    }),
    happeningsView: Backbone.View.extend({
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
                    console.log("latitude: " + happeningObject.get("location").latitude + ", longitude: " + happeningObject.get("location").longitude);
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

HAPPENING.applicationSpace.happeningsView = new HAPPENING.views.happeningsView;
