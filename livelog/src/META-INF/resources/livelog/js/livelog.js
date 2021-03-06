var livelog = angular.module('livelog', ['ngAnimate', 'ui.bootstrap', 'ngMaterial']);

// Service for the log.
livelog.factory('ll.api', [
    '$http', '$window', '$timeout',
	function($http, $window, $timeout) {
    	var service = {
    		baseUrl: $window.location.pathname,

    		// If page is secured.
    		secured: false,
    		secureToken: '',
    		loginEnabled: false,
    		
    		// Flag to disable polling manually.
    		pollingEnabled: true,
    		
    		// Controls if an async call to poll the log is in progress.
    		polling: false,
    		// Timeout to poll log file again.
    		pollingTimeout: false,
    		
    		// Controls if an async call to poll of groupings is in progress.
    		reloadingGroupings: false,
    		// Timeout to poll groupings again.
    		reloadingGroupingsTimeout: false,
    		
    		// List of log files available.
    		files: [],
    		// Name of the selected log file.
    		selected: false,
    		// Last line returned in the last poll.
    		lastLine: undefined,
    		// Current file log content.
    		log: [],
    		// Current applied filter to file list.
    		listFilter: '',
    		// Groupings enabled in web.xml.
    		groupings: [],
    		// Analytic data.
    		analyticsData: false,
    		
    		// Verify if login enabled
    		loginEnabled: function() {
    			$http({
    				method: 'GET',
    				url: service.baseUrl + 'api/login/enabled'
    			}).then(function(response) {
    				service.loginEnabled = response.data == 'true';
    				if (!service.loginEnabled) service.secured = true;
    			});
    		},
    		
    		// Tries to login at server.
    		login: function() {
    			$http({
    				method: 'GET',
    				url: service.baseUrl + 'api/login?t=' + service.secureToken
    			}).then(function(response) {
    				service.secured = true;
    				service.listFiles();
    			}, function(response) {
    				service.secured = false;
    				alert('Failed to validate secure token.');
    			});
    		},
    		
    		// List the available log files.
    		listFiles: function() {
    			$http({
    				method: 'GET', url: service.baseUrl + 'api/list-files/default-filter'
    			}).then(function(response) {
    				service.listFilter = response.data;
    			});
    			
    			$http({ 
    				method: 'GET', url: service.baseUrl + 'api/list-files' 
    			}).then(function(response) {
    				service.files = response.data;
    			});
    		},
    		
    		// Function to filter the files to list.
    		filterFiles: function(name) {
    			try {
    				return !!name.match(service.listFilter);
    			} catch(e) {
    				if (!e.message.match("regular expression")) throw e;
    			}
    		},
    		
    		// Function to filter the file content.
    		filterContent: function(line) {
    			try {
    			return !!line.content.match(service.contentFilter)
    				|| !!("" + line.line).match(service.contentFilter);
    			} catch(e) {
    				if (!e.message.match("regular expression")) throw e;
    			}
    		},
    		
    		// Function to filter the file analytic content.
    		filterAnalytics: function(ad) {
    			try {
    				return !!ad.pattern.match(service.contentFilter);
    			} catch(e) {
    				if (!e.message.match("regular expression")) throw e;
    			}
    		},
    		
    		// Function that returns an object with line color, if it matches an grouping.
    		// The first group matched will return.
    		getLineStyle: function(text) {
    			for (var g in service.groupings) {
    				var grouping = service.groupings[g];
    				if (!!text.match(grouping.regex)) {
    					return { "color": grouping.color };
    				}
    			}
    			return {};
    		},
    		
    		// Open a log file.
    		openFile: function(file) {
    			// TODO dlmorais - 13 de jun de 2016 - bug if a new file is opened and there is a live polling.
    			
    			// If there is a timeout active, cancels it.
    			!service.pollingTimeout || $timeout.cancel(service.pollingTimeout);
    			
    			// Reset all control variables.
    			service.lastLine = undefined;
    			service.log = [];
    			service.selected = file;
    			service.groupings = [];
    			
    			$http({
    				method: 'POST',
    				url: service.baseUrl + 'api/grouping/reset'
    			}).then(function() {
    				service.tail();
    			});
    		},
    		
    		// Load the analytics data.
    		loadAnalytics: function() {
    			service.pollingEnabled = false;
    			
    			$http({ 
					method: 'GET', 
					url: service.baseUrl + 'api/analytics',
					params: {
						f: service.selected 
					}
				}).then(function(response) {
					service.analyticsData = response.data;
				});
    		},
    		
    		// Closes the analytic data.
    		closeAnalytics: function() {
    			service.pollingEnabled = true;
    			service.analyticsData = false;
    		},
    		
    		// Returns an URL to download the log file.
    		download: function() {
    			return service.baseUrl + 'api/download?f=' + service.selected;
    		},
    		
    		// Tails the log file.
    		tail: function() {
    			// Prevent double polling.
    			if (!service.polling && service.pollingEnabled) {
    				service.polling = true;
    				$http({ 
    					method: 'GET', 
    					url: service.baseUrl + 'api/tail',
    					params: {
    						f: service.selected,
    						l: _.isUndefined(service.lastLine) ? undefined : (service.lastLine + 1) 
    					}
    				}).then(function(response) {
    					// Pushes all lines to the log list.
    					for (var i in response.data) {
    						service.log.push(response.data[i]);
    					}
    					
    					// Redefines the last line.
    					service.lastLine = response.data.length ? _.last(response.data).line : service.lastLine; 
    					service.pollingTimeout = $timeout(service.tail, 1000);
    					service.polling = false;
    					
    					if (response.data.length > 0) {
    						service.reloadGroupings();
    					}
    				}, function() {
    					service.pollingTimeout = $timeout(service.tail, 1000);
    					service.polling = false;
    				});
    			} else {
    				service.pollingTimeout = $timeout(service.tail, 1000);
    			}
    		},
    		
    		// Reload the groupings from server.
    		reloadGroupings: function() {
    			if (!service.reloadingGroupings) {
    				service.reloadingGroupings = true;
    				$http({ 
    					method: 'GET', 
    					url: service.baseUrl + 'api/grouping'
    				}).then(function(response) {
    					service.groupings = response.data || [];
    					service.reloadingGroupings = false;
    				}, function() {
    					service.reloadingGroupingsTimeout = $timeout(service.reloadGroupings, 1000);
    					service.reloadingGroupings = false;
    				});
    			} else {
    				service.reloadingGroupingsTimeout = $timeout(service.reloadGroupings, 1000);
    			}
    		}
    	};
    	
    	return service;
	}
]);

// Main controller for the APP.
livelog.controller('LivelogCtrl', [
	'll.api', '$rootScope', '$scope', '$interval', 
	function(llapi, $rootScope, $scope, $interval) {
		$scope.llapi = llapi;
		llapi.loginEnabled();
		llapi.listFiles();
		
		window.llapi = llapi;
		$rootScope.scrollLock = false;
		$interval(function() {
			$('.livelog-content #mdVerticalContainer .md-virtual-repeat-scroller').animate({ scrollTop: $('.livelog-content #mdVerticalContainer .md-virtual-repeat-scroller')[0].scrollHeight }, "fast");
		}, 100);

		$rootScope.keypress = function(e) {
			var key = e.which || e.keyCode;
			if (key == 145) {
				$rootScope.scrollLock = !$rootScope.scrollLock;
			}
		};
	}
]);
