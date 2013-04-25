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
    baseUrl: "http://localhost:3000"
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
                HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
                HAPPENING.applicationSpace.applicationView.locationView.locationDisplayView.render();
            });
            this.on("change:currentlyViewedTheme", function(model) {
                HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
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
        initialize: function() {
            var self = this;
            var dateArray = {
                beginDate: new Date(self.get("dates").beginDate),
                endDate: new Date(self.get("dates").endDate)
            };
            this.set("dates", dateArray);
        },
        distanceFromCurrentlyViewedLocation: function() {
            var distanceFromCurrentlyViewedLocation = HAPPENING.utils.calculateDistance(this.get("location").latitude, this.get("location").longitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").latitude, HAPPENING.applicationSpace.user.get("currentlyViewedLocation").longitude);
            return distanceFromCurrentlyViewedLocation;
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
        // the comparator function determines sorting
        comparator: function(happening){
            return happening.distanceFromCurrentlyViewedLocation();
        },
        initialize: function() {
            var self = this;
            this.url = function() {
                var requestUrl = '';
                requestUrl += HAPPENING.settings.baseUrl;
                requestUrl += '/happenings';
                var currentlyViewedTheme = HAPPENING.applicationSpace.user.get("currentlyViewedTheme").id;
                if (currentlyViewedTheme) {
                    requestUrl += '?themeid=';
                    requestUrl += currentlyViewedTheme;
                };
                return requestUrl;
            };
            this.fetch({reset: true});
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
                    }
                ],
                resourceName: "happening",
                submitFunction: function() {
                    HAPPENING.applicationSpace.applicationView.happeningsView.collection.fetch({reset: true});
                }
            });
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
                $(this.el).append("<div><form>" + this.options.description + "<input type='text'></input></form></div>");
            }
            else {
                $(this.el).append("<div>" + this.options.description + "<input type='text' name='" + this.options.description + "'></input></div>");
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
            // get the list of parameters to be posted by the form from the newly created view object
            var postParameters = this.options.postParameters;
            // clear el
            $(this.el).empty();
            // add html for the form and the submit button
            $(this.el).append("<div>Submit a new " + this.options.resourceName + " here<form></form></div>");
            // for each parameter to be passed by the form, add an appropriate input element
            postParameters.forEach(function(postParameter) {
                if (postParameter.type === "date") {
                    $(self.el).find("form").append("<div id='" + postParameter.id + "'>" + postParameter.label + "<input type='text' name='" + postParameter.id + "'></input></div>");
                    $(self.el).find("#" + postParameter.id + " input").datepicker({
                        dateFormat: "yy-mm-dd"
                    });
                }
                else if (postParameter.type === "theme") {
                    $(self.el).find("form").append("<div id='" + postParameter.id + "'></div>");
                    self.themeInputView = new HAPPENING.views.SearchView({
                        el: "#" + postParameter.id,
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
                }
                else if (postParameter.type === "location") {
                    $(self.el).find("form").append("<div id='" + postParameter.id + "'></div>");
                    self.locationInputView = new HAPPENING.views.SearchView({
                        el: "#" + postParameter.id,
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
                }
                else {
                    $(self.el).find("form").append("<div id='" + postParameter.id + "'>" + postParameter.label + "<input type='text' name='" + postParameter.id + "'></input></div>");
                };
            });
            $(this.el).find("form").append("<div><input type='submit' value='Submit " + this.options.resourceName + "'></input></div>");
            // create the event that makes a post request upon submitting the form
            $(this.el).find("form").on("submit", function(event) {
                // stop the automatic page reload upon form submission
                event.preventDefault();
                // check to make sure all inputs are filled in
                postParameters.forEach(function(postParameter) {
                    if ($(self.el).find("#" + postParameter.id + " input").val() === undefined || $(self.el).find("#" + postParameter.id + " input").val() === "") {
                        throw {
                            name: "all post parameters must be set",
                            message: "one or more post parameters are not set"
                        };
                    }; 
                });
                var postRequest = HAPPENING.settings.baseUrl + self.options.postUrl + "?";
                postParameters.forEach(function(postParameter) {
                    if (postParameter.type === "theme") {
                        postRequest += "themeid=";
                        postRequest += self.theme.id;
                    }
                    else if (postParameter.type === "location") {
                        postRequest += "cityid=";
                        postRequest += self.location.get("address").cityId;
                    }
                    else {
                        postRequest += postParameter.id;
                        postRequest += "=";
                        postRequest += $(self.el).find("input[name=\"" + postParameter.id + "\"]").val();
                    };
                    postRequest += "&";
                });                
                var postResponse = HAPPENING.utils.makeHttpRequest(postRequest, "POST");
                self.options.submitFunction();
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
             $(this.el).empty();
             $(this.el).append("<div id=\"location-display\"></div><div id=\"location-search\"></div>");
            this.locationDisplayView = new HAPPENING.views.LocationDisplayView({
                el: "#location-display"
            });
            this.locationSearchView = new HAPPENING.views.SearchView({
                el: "#location-search",
                addFormElement: true,
                description: "Select a new location here:",
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
        },
    }),
    HappeningsView: Backbone.View.extend({
        initialize: function() {
            // append a loading animation to tide us over until the collection resets
            $(this.el).html("[LOADING ANIMATION]");
            // create a new collection, which will fetch models and trigger a redraw of this view
            this.collection = new HAPPENING.collections.HappeningCollection();
            // set this view to render whenever its collection resets
            this.listenTo(this.collection, 'reset', this.render);
        },
        // TODO: happenings should really be their own views
        render: function() {
            console.log('rendering happeningsView');
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
                        "beginDate": happeningObject.get("dates").beginDate.getFullYear().toString() + "-" + happeningObject.get("dates").beginDate.getMonth() + "-" + happeningObject.get("dates").beginDate.getDate(),
                        "endDate": happeningObject.get("dates").endDate.getFullYear().toString() + "-" + happeningObject.get("dates").endDate.getMonth() + "-" + happeningObject.get("dates").endDate.getDate(),
                        "city": happeningObject.get("location").cityName
                    };
                    if (HAPPENING.applicationSpace.user.isLocationDefined()) {
                        happeningData.distanceFromUserLocation = (Math.floor(happeningObject.distanceFromCurrentlyViewedLocation()) || happeningObject.distanceFromCurrentlyViewedLocation().toFixed(1)).toString() + " miles away";
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
                addFormElement: true,
                description: "Select a new theme here:",
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
                        "label": "All Themes",
                        "id": undefined
                    });
                    return processedData;
                },
                selectFunction: function(event, ui) {
                    HAPPENING.applicationSpace.user.set("currentlyViewedTheme", {"id": ui.item.id, "name": ui.item.label});
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
                themeHtml = "Select a theme to narrow down your search";
            }
            else {
                themeHtml = "You've selected the following theme: " + this.currentlyViewedTheme.name;
            };
            $(this.el).append(themeHtml);
        }
    }),
    LocationDisplayView: Backbone.View.extend({
        initialize: function() {
            this.render();
        },
        render: function() {
            $(this.el).empty();
           var currentlyViewedLocation = HAPPENING.applicationSpace.user.get("currentlyViewedLocation");
            themeHtml = "";
            if (typeof currentlyViewedLocation.city === undefined || typeof currentlyViewedLocation.country === undefined) {
                themeHtml = "Please select a location.";
            }
            else {
                themeHtml = "You've selected the following location: " + currentlyViewedLocation.address.city + ", " + currentlyViewedLocation.address.country;
            };
            $(this.el).append(themeHtml);
        }
    })
};

// the actual program that makes things happen
HAPPENING.applicationSpace = {};

HAPPENING.applicationSpace.user = new HAPPENING.models.User;

HAPPENING.applicationSpace.applicationView = new HAPPENING.views.ApplicationView;

