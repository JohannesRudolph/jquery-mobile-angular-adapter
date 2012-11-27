/**
* jQuery Mobile angularJS adaper v1.1.2-SNAPSHOT
* http://github.com/tigbro/jquery-mobile-angular-adapter
*
* Copyright 2011, Tobias Bosch (OPITZ CONSULTING GmbH)
* Licensed under the MIT license.
*/
(function(factory) {
if (typeof define === "function" && define.amd) {
define(["jquery", "angular", "jquery.mobile"], factory);
} else {
factory(window.jQuery, window.angular);
}
})(function($, angular) {
(function ($) {
    function patch(obj, fnName, callback) {
        var _old = obj[fnName];
        obj[fnName] = function () {
            return callback(_old, this, arguments);
        }
    }

    // selectmenu may create parent elements and extra pages
    patch($.mobile.selectmenu.prototype, 'destroy', function (old, self, args) {
        old.apply(self, args);
        var menuPage = self.menuPage;
        var screen = self.screen;
        var listbox = self.listbox;
        menuPage && menuPage.remove();
        screen && screen.remove();
        listbox && listbox.remove();
    });

    // native selectmenu throws an error is no option is contained!
    $.mobile.selectmenu.prototype.placeholder = "";


    // Listview may create subpages that need to be removed when the widget is destroyed.
    patch($.mobile.listview.prototype, "destroy", function (old, self, args) {
        // Destroy the widget instance first to prevent
        // a stack overflow.
        // Note: If there are more than 1 listview on the page, childPages will return
        // the child pages of all listviews.
        var id = self.element.attr('id');
        var childPageRegex = new RegExp($.mobile.subPageUrlKey + "=" + id + "-");
        var childPages = self.childPages();
        old.apply(self, args);
        for (var i = 0; i < childPages.length; i++) {
            var childPage = $(childPages[i]);
            var dataUrl = childPage.attr('data-url');
            if (dataUrl.match(childPageRegex)) {
                childPage.remove();
            }
        }
    });

    // refresh of listview should refresh also non visible entries if the
    // listview itself is not visible
    patch($.mobile.listview.prototype, "refresh", function (old, self, args) {
        if (self.element.filter(":visible").length === 0) {
            return old.call(self, true);
        } else {
            return old.apply(self, args);
        }
    });

    // Copy of the initialization code from jquery mobile for controlgroup.
    // Needed in jqm 1.1, as we want to do a manual initialization.
    // See the open task in jqm 1.1 for controlgroup.
    if ($.fn.controlgroup) {
        $(document).bind("pagecreate create", function (e) {
            $(":jqmData(role='controlgroup')", e.target)
                .jqmEnhanceable()
                .controlgroup({ excludeInvisible:false });
        });
    }

    // Patch 1: controlgroup should not exclude invisible children
    // as long as it is not visible itself!
    patch($.fn, "controlgroup", function (old, self, args) {
        if (self.filter(":visible").length === 0) {
            var options = args[0] || {};
            options.excludeInvisible = false;
            return old.call(self, options);
        }
        return old.apply(self, args);
    });

    // collapsible has problems when a collapsible is created with a nested collapsible,
    // if the nested collapsible is created before the outside collapsible.
    var _c = $.fn.collapsible;
    var nestedContentClass = "ui-collapsible-content";
    $.fn.collapsible = function () {
        var nestedContent = this.find(".ui-collapsible-content");
        nestedContent.removeClass(nestedContentClass);
        try {
            return _c.apply(this, arguments);
        } finally {
            nestedContent.addClass(nestedContentClass);
        }
    };

    // navbar does not contain a refresh function, so we add it here.

    patch($.mobile.navbar.prototype, '_create', function (old, self, args) {
        var _find = $.fn.find;
        var navbar = self.element;
        var navbarBtns;
        $.fn.find = function(selector) {
            var res = _find.apply(this, arguments);
            if (selector==='a') {
                navbar.data('$navbtns', res);
            }
            return res;
        };
        try {
            return old.apply(self, args);
        } finally {
            $.fn.find = _find;
        }
    });

    $.mobile.navbar.prototype.refresh = function () {
        var $navbar = this.element;

        var $navbtns = $navbar.data("$navbtns");
        $navbtns.splice(0, $navbtns.length);
        $.each($navbar.find("a"), function(key, value) {
            $navbtns.push(value);
        });
        var iconpos = $navbtns.filter(":jqmData(icon)").length ?
                this.options.iconpos : undefined;

        var list = $navbar.find("ul");
        var listEntries = list.children("li");
        list.removeClass(function (index, css) {
            return (css.match(/\bui-grid-\S+/g) || []).join(' ');
        });
        listEntries.removeClass(function (index, css) {
            return (css.match(/\bui-block-\S+/g) || []).join(' ');
        });
        list.jqmEnhanceable().grid({ grid:this.options.grid });

        $navbtns.buttonMarkup({
            corners:false,
            shadow:false,
            inline:true,
            iconpos:iconpos
        });
    };

})($);
/**
 * Helper that introduces the concept of precompilation: Preprocess the dom before
 * angular processes it.
 * <p>
 * Usage: Create a decorator or a factory for the $precompile service.
 */
(function ($, angular) {
    var ng = angular.module('ng');
    ng.factory("$precompile", function() {
        return function(element) {
            // This is empty and can be decorated using $provide.decorator.
            return element;
        }
    });

    ng.config(['$provide', function ($provide) {
        $provide.decorator('$compile', ['$precompile', '$delegate', function ($precompile, $compile) {
            return function () {
                arguments[0] = $precompile(arguments[0]);
                return $compile.apply(this, arguments);
            }
        }]);
    }]);

    function precompileHtmlString(html, $precompile) {
        var $template = $('<div>' + html + '</div>');
        $precompile($template.contents());
        return $template.html();
    }

    ng.config(['$compileProvider', '$provide', function ($compileProvider, $provide) {
        var directiveTemplateUrls = {};

        // Hook into the registration of directives to:
        // - preprocess template html
        // - mark urls from templateUrls so we can preprocess it later in $http
        var _directive = $compileProvider.directive;
        $compileProvider.directive = function (name, factory) {
            var newFactory = function ($precompile, $injector) {
                var res = $injector.invoke(factory);
                if (res.template) {
                    res.template = precompileHtmlString(res.template, $precompile);
                } else if (res.templateUrl) {
                    directiveTemplateUrls[res.templateUrl] = true;
                }
                return res;
            };
            return _directive.call(this, name, ['$precompile', '$injector', newFactory]);
        };

        // preprocess $http results for templateUrls.
        $provide.decorator('$http', ['$q', '$delegate', '$precompile', function ($q, $http, $precompile) {
            var _get = $http.get;
            $http.get = function (url) {
                var res = _get.apply(this, arguments);
                if (directiveTemplateUrls[url]) {
                    var _success = res.success;
                    res.success = function(callback) {
                        var newCallback = function() {
                            var content = arguments[0];
                            arguments[0] = precompileHtmlString(content, $precompile);
                            return callback.apply(this, arguments);
                        };
                        return _success(newCallback);
                    };
                }
                return res;
            };
            return $http;
        }]);
    }]);

})($, angular);
(function (angular) {

    var ng = angular.module('ng');
    ng.config(['$provide', function($provide) {
        $provide.decorator('$rootScope', ['$delegate', function($rootScope) {
            $rootScope.$disconnect = function() {
                if (this.$root == this) return; // we can't disconnect the root node;
                var parent = this.$parent;
                this.$$disconnected = true;
                // See Scope.$destroy
                if (parent.$$childHead == this) parent.$$childHead = this.$$nextSibling;
                if (parent.$$childTail == this) parent.$$childTail = this.$$prevSibling;
                if (this.$$prevSibling) this.$$prevSibling.$$nextSibling = this.$$nextSibling;
                if (this.$$nextSibling) this.$$nextSibling.$$prevSibling = this.$$prevSibling;
                this.$$nextSibling = this.$$prevSibling = null;
            };
            $rootScope.$reconnect = function() {
                if (this.$root == this) return; // we can't disconnect the root node;
                var child = this;
                if (!child.$$disconnected) {
                    return;
                }
                var parent = child.$parent;
                child.$$disconnected = false;
                // See Scope.$new for this logic...
                child.$$prevSibling = parent.$$childTail;
                if (parent.$$childHead) {
                    parent.$$childTail.$$nextSibling = child;
                    parent.$$childTail = child;
                } else {
                    parent.$$childHead = parent.$$childTail = child;
                }

            };
            return $rootScope;
        }]);
    }]);
})(angular);
(function (angular) {
    var ng = angular.module('ng');
    ng.config(['$provide', function ($provide) {
        $provide.decorator('$rootScope', ['$delegate', function ($rootScope) {
            var _apply = $rootScope.$apply;
            $rootScope.$apply = function () {
                if ($rootScope.$$phase) {
                    return $rootScope.$eval.apply(this, arguments);
                }
                return _apply.apply(this, arguments);
            };
            var refreshing = false;
            var _digest = $rootScope.$digest;
            $rootScope.$digest = function () {
                if ($rootScope.$$phase) {
                    return;
                }
                var res = _digest.apply(this, arguments);
            };
            return $rootScope;
        }]);
    }]);
})(angular);
(function ($, angular) {
    // Only digest the $.mobile.activePage when rootScope.$digest is called.
    var ng = angular.module('ng');
    $('div').live('pagebeforeshow', function (event, data) {
        var page = $(event.target);
        var currPageScope = page.scope();
        if (currPageScope) {
            currPageScope.$emit("jqmPagebeforeshow");
            currPageScope.$root.$digest();
        }
    });

    $.mobile.autoInitializePage = false;
    var lastCreatedPages = [];
    var jqmInitialized = false;

    ng.config(['$provide', function ($provide) {
        $provide.decorator('$rootScope', ['$delegate', function ($rootScope) {
            var _$digest = $rootScope.$digest;
            var lastActiveScope;
            $rootScope.$digest = function () {
                if (this === $rootScope) {
                    var p = $.mobile.activePage;
                    var activeScope = p && p.scope();
                    if (lastActiveScope && lastActiveScope !== activeScope) {
                        lastActiveScope.$disconnect();
                    }
                    lastActiveScope = activeScope;
                    if (activeScope) {
                        activeScope.$reconnect();
                    }
                }
                var res = _$digest.apply(this, arguments);
                if (this === $rootScope) {
                    var hasPages = lastCreatedPages.length;
                    while (lastCreatedPages.length) {
                        var pageScope = lastCreatedPages.shift();
                        // Detach the scope of the created pages from the normal $digest cycle.
                        // Needed so that only $.mobile.activePage gets digested when rootScope.$digest
                        // is called.
                        // However, allow one digest to process every page
                        // so that we can use ng-repeat also for jqm pages!
                        pageScope.$disconnect();
                    }
                    if (hasPages && !jqmInitialized) {
                        jqmInitialized = true;
                        $.mobile.initializePage();
                        $rootScope.$broadcast("jqmInit");
                    }
                }

                return res;
            };
            return $rootScope;
        }]);
    }]);

    function connectToDocument(node, callback) {
        if (!node.parentNode) {
            return callback();
        }
        // search the top most element for node.
        while (node.parentNode && node.parentNode.nodeType === 1) {
            node = node.parentNode;
        }
        var oldParentNode = node.parentNode;
        if (oldParentNode !== document) {
            document.documentElement.appendChild(node);
        }
        try {
            return callback();
        } finally {
            if (oldParentNode !== document) {
                oldParentNode.appendChild(node);
            }
        }
    }

    /**
     * This directive will enhance the dom during compile
     * with non widget markup. This will also mark elements that contain
     * jqm widgets.
     */
    ng.factory('$precompile', function () {
        var pageSelector = ':jqmData(role="page"), :jqmData(role="dialog")';

        return function (element) {
            // save the old parent
            var oldParentNode = element[0].parentNode;

            // if the element is not connected with the document element,
            // the enhancements of jquery mobile do not work (uses event listeners for the document).
            // So temporarily connect it...
            connectToDocument(element[0], function () {

                var pages = element.find(pageSelector).add(element.filter(pageSelector));
                pages.attr("ngm-page", "true");

                // enhance non-widgets markup.
                markJqmWidgetCreation(function () {
                    preventJqmWidgetCreation(function () {
                        if (pages.length > 0) {
                            // element contains pages.
                            // create temporary pages for the non widget markup, that we destroy afterwards.
                            // This is ok as non widget markup does not hold state, i.e. no permanent reference to the page.
                            pages.page();
                        } else {
                            element.parent().trigger("create");
                        }
                    });
                });

                // Destroy the temporary pages again
                pages.page("destroy");
            });

            // If the element wrapped itself into a new element,
            // return the element that is under the same original parent
            while (element[0].parentNode !== oldParentNode) {
                element = element.eq(0).parent();
            }

            return element;
        }
    });

    /**
     * Special directive for pages, as they need an own scope.
     */
    ng.directive('ngmPage', function () {
        return {
            restrict:'A',
            scope:true,
            compile:function (tElement, tAttrs) {
                tElement.removeAttr("ngm-page");
                return {
                    pre:function (scope, iElement, iAttrs) {
                        // Create the page widget without the pagecreate-Event.
                        // This does no dom transformation, so it's safe to call this in the prelink function.
                        createPagesWithoutPageCreateEvent(iElement);
                        lastCreatedPages.push(scope);
                    }
                };
            }
        };
    });

    // If jqm loads a page from an external source, angular needs to compile it too!
    ng.run(['$rootScope', '$compile', function ($rootScope, $compile) {
        patchJq('page', function () {
            if (!preventJqmWidgetCreation() && !this.data("page")) {
                if (this.attr("data-" + $.mobile.ns + "external-page")) {
                    $compile(this)($rootScope);
                }
            }
            return $.fn.orig.page.apply(this, arguments);
        });
    }]);

    $.mobile.registerJqmNgWidget = function (widgetName, widgetSpec) {
        jqmWidgets[widgetName] = widgetSpec;
        patchJqmWidget(widgetName, widgetSpec.precompile);
    };

    var jqmWidgets = {};
    /**
     * Directive for calling the create function of a jqm widget.
     * For elements that wrap themselves into new elements (like `<input type="checked">`) ngmCreate will be called
     * on the wrapper element for the input and the label, which is created during precompile.
     * ngmLink will be called on the actual input element, so we have access to the ngModel and attrs for $observe calls.
     */
    ng.directive("ngmCreate", function () {
        return {
            restrict:'A',
            // after the normal angular widgets like input, ngModel, ...
            priority:0,
            compile:function (tElement, tAttrs) {
                var widgets = JSON.parse(tAttrs.ngmCreate);
                return {
                    post:function (scope, iElement, iAttrs, ctrls) {
                        var widgetName, widgetSpec, initArgs, origCreate;
                        for (widgetName in widgets) {
                            widgetSpec = jqmWidgets[widgetName];
                            initArgs = widgets[widgetName];
                            origCreate = $.fn.orig[widgetName];
                            if (widgetSpec.create) {
                                widgetSpec.create(origCreate, iElement, initArgs);
                            } else {
                                origCreate.apply(iElement, initArgs);
                            }
                        }
                    }
                };
            }
        }
    });

    /**
     * Directive for connecting widgets with angular. See ngmCreate.
     */
    ng.directive("ngmLink", ["$injector", function ($injector) {
        return {
            restrict:'A',
            priority:0,
            require:['?ngModel'],
            compile:function (tElement, tAttrs) {
                var widgets = JSON.parse(tAttrs.ngmLink);
                return {
                    post:function (scope, iElement, iAttrs, ctrls) {
                        var widgetName, widgetSpec;
                        for (widgetName in widgets) {
                            widgetSpec = jqmWidgets[widgetName];
                            widgetSpec.link(scope, iElement, iAttrs, ctrls, $injector);
                        }
                    }
                };
            }
        }
    }]);

    function patchJqmWidget(widgetName, precompileFn) {
        patchJq(widgetName, function () {
            if (markJqmWidgetCreation()) {
                var args = Array.prototype.slice.call(arguments);
                var self = this;
                for (var k = 0; k < self.length; k++) {
                    var element = self.eq(k);
                    var createElement = element;
                    if (precompileFn) {
                        createElement = precompileFn(element, args) || createElement;
                    }
                    var ngmCreateStr = createElement.attr("ngm-create") || '{}';
                    var ngmCreate = JSON.parse(ngmCreateStr);
                    ngmCreate[widgetName] = args;
                    createElement.attr("ngm-create", JSON.stringify(ngmCreate));
                    // attribute needs to be after the ngm-create attribute!
                    var ngmLinkStr = element.attr("ngm-link") || '{}';
                    var ngmLink = JSON.parse(ngmLinkStr);
                    ngmLink[widgetName] = true;
                    element.attr("ngm-link", JSON.stringify(ngmLink));
                }
            }
            if (preventJqmWidgetCreation()) {
                return false;
            }
            return $.fn.orig[widgetName].apply(this, arguments);
        });
    }

    $.fn.orig = {};

    function patchJq(fnName, callback) {
        $.fn.orig[fnName] = $.fn.orig[fnName] || $.fn[fnName];
        $.fn[fnName] = callback;
    }

    var _execFlags = {};

    function execWithFlag(flag, fn) {
        if (!fn) {
            return _execFlags[flag];
        }
        var old = _execFlags[flag];
        _execFlags[flag] = true;
        var res = fn();
        _execFlags[flag] = old;
        return res;
    }

    function preventJqmWidgetCreation(fn) {
        return execWithFlag('preventJqmWidgetCreation', fn);
    }

    function markJqmWidgetCreation(fn) {
        return execWithFlag('markJqmWidgetCreation', fn);
    }

    function createPagesWithoutPageCreateEvent(pages) {
        preventJqmWidgetCreation(function () {
            var oldPrefix = $.mobile.page.prototype.widgetEventPrefix;
            $.mobile.page.prototype.widgetEventPrefix = 'noop';
            pages.page();
            $.mobile.page.prototype.widgetEventPrefix = oldPrefix;
        });
    }

})($, angular);
(function (angular, $) {
    var widgetConfig = {
        checkboxradio:{
            handlers:[disabledHandler, refreshAfterNgModelRender, checkedHandler],
            precompile:checkboxRadioPrecompile,
            create:checkboxRadioCreate
        },
        // Button wraps itself into a new element.
        // Angular does not like this, so we do it in advance.
        button:{
            handlers:[disabledHandler],
            precompile:wrapIntoDivPrecompile,
            create:buttonCreate
        },
        collapsible:{
            handlers:[disabledHandler, collapsedHandler]
        },
        textinput:{
            handlers:[disabledHandler],
            precompile:textinputPrecompile,
            create:unwrapFromDivCreate
        },
        slider:{
            handlers:[disabledHandler, refreshAfterNgModelRender],
            precompile:wrapIntoDivPrecompile,
            create:sliderCreate
        },
        listview:{
            handlers:[refreshOnChildrenChange]
        },
        collapsibleset:{
            handlers:[refreshOnChildrenChange]
        },
        // selectmenu wraps itself into a button and an outer div.
        // Angular does not like this, so we do it in advance.
        selectmenu:{
            handlers:[disabledHandler, refreshAfterNgModelRender, refreshOnChildrenChange],
            precompile:wrapIntoDivPrecompile,
            create:unwrapFromDivCreate
        },
        controlgroup:{
            handlers:[refreshControlgroupOnChildrenChange]
        },
        navbar:{
            handlers:[refreshOnChildrenChange]
        },
        dialog:{
            handlers:[],
            precompile:dialogPrecompile,
            create:dialogCreate
        },
        fixedtoolbar:{
            handlers:[]
        }
    };

    function mergeHandlers(widgetName, list) {
        return function ($injector) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(widgetName);
            args.push($injector);
            for (var i = 0; i < list.length; i++) {
                list[i].apply(this, args);
            }
        }
    }

    var config;
    for (var widgetName in widgetConfig) {
        config = widgetConfig[widgetName];
        config.link = mergeHandlers(widgetName, config.handlers);
        $.mobile.registerJqmNgWidget(widgetName, config);
    }

    // -------------------
    // precompile and create functions

    // Slider appends a new element after the input/select element for which it was created.
    // The angular compiler does not like this, so we wrap the two elements into a new parent node.
    function sliderCreate(origCreate, element, initArgs) {
        var slider = element.children().eq(0);
        origCreate.apply(slider, initArgs);
    }

    // Checkboxradio requires a label for every checkbox input. From the jqm perspective, the label
    // can be at different locations in the DOM tree. However, if the
    // label is not under the same parent as the checkbox, this could change the DOM structure
    // too much for angular's compiler.
    // So we dynamically create a parent <fieldset> and move the label into that tag if needed.
    // Also, the checkboxradio widget changes dom elements in the neighbouring label element,
    // which is also a no-go for the angular compiler. For this, we create the checkboxradio widget
    // when we are linking the <fieldset> element, as changing children is fine for the compiler.
    function checkboxRadioPrecompile(origElement, initArgs) {
        // See the checkboxradio-Plugin in jqm for the selectors used to locate the label.
        var parentLabel = $(origElement).closest("label");
        var container = $(origElement).closest("form,fieldset,:jqmData(role='page'),:jqmData(role='dialog')");
        if (container.length === 0) {
            container = origElement.parent();
        }
        var label = parentLabel.length ? parentLabel : container.find("label").filter("[for='" + origElement[0].id + "']");
        var parent = origElement.parent();
        if (parent[0].tagName.toUpperCase() !== 'FIELDSET') {
            origElement.wrap("<fieldset></fieldset>");
        }
        // ensure that the label is after the input element in each case.
        var wrapper = origElement.parent();
        wrapper.append(label);
        moveCloningDirectives(origElement, wrapper);
        return wrapper;
    }

    function checkboxRadioCreate(origCreate, element, initArgs) {
        // we ensured in precompile that the label is after the checkbox and both are within a <fieldset>
        var checkbox = element.children().eq(0);
        origCreate.apply(checkbox, initArgs);
    }

    function buttonCreate(origCreate, element, initArgs) {
        // Button destroys the text node and recreates a new one. This does not work
        // if the text node contains angular expressions.
        var button = element.children().eq(0);
        var textNode = button.contents();
        var res = unwrapFromDivCreate(origCreate, element, initArgs);
        var textSpan = element.find("span span");
        textSpan.empty();
        textSpan.append(textNode);
        return res;
    }

    // textinput for input-type "search" wraps itself into a new element
    function textinputPrecompile(origElement, initArgs) {
        if (!origElement.is("[type='search'],:jqmData(type='search')")) {
            return origElement;
        }
        return wrapIntoDivPrecompile(origElement, initArgs);
    }

    function wrapIntoDivPrecompile(origElement, initArgs) {
        origElement.wrapAll("<div></div>");
        var wrapper = origElement.parent();
        moveCloningDirectives(origElement, wrapper);
        return wrapper;
    }

    function unwrapFromDivCreate(origCreate, element, initArgs) {
        if (element[0].nodeName.toUpperCase() !== "DIV") {
            // no wrapper existing.
            return origCreate.apply(element, initArgs);
        }

        if (isMock(origCreate)) {
            // spy that does not call through
            return origCreate.apply(element, initArgs);
        }

        var child = element.children().eq(0);
        child.insertBefore(element);
        element.empty();
        return useExistingElementsForNewElements(element, function () {
            return origCreate.apply(child, initArgs);
        });
    }

    // Dialog: separate event binding and dom enhancement.
    // Note: We do need to add the close button during precompile,
    // as the enhancement for the dialog header depends on it (calculation which button is left, right, ...)
    // We cannot adjust the timing of the header enhancement as it is no jqm widget.
    function dialogPrecompile(origElement, initAttrs) {
        var options = $.mobile.dialog.prototype.options;
        var headerCloseButton = $("<a href='#' data-" + $.mobile.ns + "icon='delete' data-" + $.mobile.ns + "iconpos='notext'>" + options.closeBtnText + "</a>");
        origElement.find(":jqmData(role='header')").prepend(headerCloseButton);
        origElement.data('headerCloseButton', headerCloseButton);
        return origElement;
    }

    function dialogCreate(origCreate, element, initArgs) {
        if (isMock(origCreate)) {
            // During unit tests...
            return origCreate.apply(element, initArgs);
        }
        var headerCloseButton = element.data('headerCloseButton');
        return useExistingElementsForNewElements(headerCloseButton, function () {
            return origCreate.apply(element, initArgs);
        });
    }

    function isMock(origCreate) {
        return origCreate.isSpy && origCreate.originalValue !== origCreate.plan;
    }

    function useExistingElementsForNewElements(existingElements, callback) {
        var i, el, tagName;
        var existingElementsHashByElementName = {};
        for (i = 0; i < existingElements.length; i++) {
            el = existingElements.eq(i);
            // Do not use jQuery.fn.remove as this will fire a destroy event,
            // which leads to unwanted side effects by it's listeners.
            el[0].parentNode.removeChild(el[0]);
            tagName = el[0].nodeName.toUpperCase();
            existingElementsHashByElementName[tagName] = el;
        }

        function useExistingElementIfPossible(selector) {
            if (selector) {
                var template = $(selector);
                var tagName = template[0].nodeName.toUpperCase();
                var existingElement = existingElementsHashByElementName[tagName];
                if (existingElement) {
                    delete existingElementsHashByElementName[tagName];
                    existingElement[0].className += ' ' + template[0].className;
                    return existingElement;
                }
            }
            return false;
        }

        var res = withPatches($.fn, {
            init:function (_init, self, args) {
                var selector = args[0];
                if (typeof selector === "string" && selector.charAt(0) === '<') {
                    var existingElement = useExistingElementIfPossible(selector);
                    if (existingElement) {
                        return existingElement;
                    }
                }
                return _init.apply(self, args);
            },
            wrap:function (_wrap, self, args) {
                var selector = args[0];
                var wrapper = useExistingElementIfPossible(selector);
                if (wrapper) {
                    wrapper.insertBefore(self);
                    wrapper.append(self);
                    return self;
                }
                return _wrap.apply(self, args);
            },
            wrapAll:function (_wrapAll, self, args) {
                var selector = args[0];
                var wrapper = useExistingElementIfPossible(selector);
                if (wrapper) {
                    wrapper.insertBefore(self);
                    wrapper.append(self);
                    return self;
                }
                return _wrapAll.apply(self, args);
            }
        }, callback);
        for (tagName in existingElementsHashByElementName) {
            throw new Error("existing element with tagName " + tagName + " was not used!");
        }
        return res;
    }

    function withPatches(obj, patches, callback) {
        var _old = {};
        var executingCount = 0;

        function patchProp(prop) {
            var oldFn = _old[prop] = obj[prop];
            oldFn.restore = function () {
                obj[prop] = oldFn;
                delete oldFn.restore;
            };
            obj[prop] = function () {
                if (executingCount) {
                    return oldFn.apply(this, arguments);
                }
                executingCount++;
                try {
                    return patches[prop](oldFn, this, arguments);
                } finally {
                    executingCount--;
                }
            };
            obj[prop].prototype = oldFn.prototype;
        }

        var prop;
        for (prop in patches) {
            patchProp(prop);
        }
        try {
            return callback();
        } finally {
            for (prop in _old) {
                _old[prop].restore && _old[prop].restore();
            }
        }
    }

    var CLONING_DIRECTIVE_REGEXP = /(^|[\W])(repeat|switch-when|if)($|[\W])/;

    function moveCloningDirectives(source, target) {
        // iterate over the attributes
        var cloningAttrNames = [];
        var node = source[0];
        var targetNode = target[0];
        var nAttrs = node.attributes;
        var attrCount = nAttrs && nAttrs.length;
        if (attrCount) {
            for (var attr, name,
                     j = attrCount - 1; j >= 0; j--) {
                attr = nAttrs[j];
                name = attr.name;
                if (CLONING_DIRECTIVE_REGEXP.test(name)) {
                    node.removeAttributeNode(attr);
                    targetNode.setAttributeNode(attr);
                }
            }
        }

        // iterate over the class names.
        var targetClassName = '';
        var className = node.className;
        var match;
        if (className) {
            className = className.replace(/[^;]+;?/, function (match) {
                if (CLONING_DIRECTIVE_REGEXP.test(match)) {
                    targetClassName += match;
                    return '';
                }
                return match;
            });
        }
        if (targetClassName) {
            targetNode.className = targetClassName;
            node.className = className;
        }
    }

    // Expose for tests.
    $.mobile.moveCloningDirectives = moveCloningDirectives;


    // -------------------
    // link handlers
    function disabledHandler(widgetName, scope, iElement, iAttrs, ctrls) {
        iAttrs.$observe("disabled", function (value) {
            if (value) {
                iElement[widgetName]("disable");
            } else {
                iElement[widgetName]("enable");
            }
        });
    }

    function collapsedHandler(widgetName, scope, iElement, iAttrs, ctrls, $inject) {
        var $parse = $inject.get("$parse");
        if (iAttrs.collapsed) {
            var collapsedGetter = $parse(iAttrs.collapsed);
            var collapsedSetter = collapsedGetter.assign;
            scope.$watch(collapsedGetter, function (value) {
                if (value) {
                    iElement.trigger("collapse");
                } else {
                    iElement.trigger("expand");
                }
            });
            if (collapsedSetter) {
                iElement.bind("collapse", function () {
                    scope.$apply(function () {
                        collapsedSetter(scope, true);
                    });
                });
                iElement.bind("expand", function () {
                    scope.$apply(function () {
                        collapsedSetter(scope, false);
                    });
                });
            }
        }
    }

    function checkedHandler(widgetName, scope, iElement, iAttrs, ctrls) {
        iAttrs.$observe("checked", function (value) {
            triggerAsyncRefresh(widgetName, scope, iElement, "refresh");
        });
    }

    function addCtrlFunctionListener(ctrl, ctrlFnName, fn) {
        var listenersName = "_listeners" + ctrlFnName;
        if (!ctrl[listenersName]) {
            ctrl[listenersName] = [];
            var oldFn = ctrl[ctrlFnName];
            ctrl[ctrlFnName] = function () {
                var res = oldFn.apply(this, arguments);
                for (var i = 0; i < ctrl[listenersName].length; i++) {
                    ctrl[listenersName][i]();
                }
                return res;
            };
        }
        ctrl[listenersName].push(fn);
    }

    function refreshAfterNgModelRender(widgetName, scope, iElement, iAttrs, ctrls) {
        var ngModelCtrl = ctrls[0];
        if (ngModelCtrl) {
            addCtrlFunctionListener(ngModelCtrl, "$render", function () {
                triggerAsyncRefresh(widgetName, scope, iElement, "refresh");
            });
        }
    }

    function refreshControlgroupOnChildrenChange(widgetName, scope, iElement, iAttrs, ctrls) {
        iElement.bind("$childrenChanged", function () {
            triggerAsyncRefresh(widgetName, scope, iElement, {});
        });
    }


    function refreshOnChildrenChange(widgetName, scope, iElement, iAttrs, ctrls) {
        iElement.bind("$childrenChanged", function () {
            triggerAsyncRefresh(widgetName, scope, iElement, "refresh");
        });
    }

    function triggerAsyncRefresh(widgetName, scope, iElement, options) {
        var prop = "_refresh" + widgetName;
        var refreshId = (iElement.data(prop) || 0) + 1;
        iElement.data(prop, refreshId);
        scope.$evalAsync(function () {
            if (iElement.data(prop) === refreshId) {
                iElement[widgetName](options);
            }
        });
    }


})
    (angular, $);
/**
 * This combines the routing of angular and jquery mobile. In detail, it deactivates the routing in jqm
 * and reuses that of angular.
 */
(function (angular, $) {
    var mod = angular.module("ng");

    function registerBrowserDecorator($provide) {
        $provide.decorator('$browser', ['$delegate', function ($browser) {
            $browser.inHashChange = 0;
            var _onUrlChange = $browser.onUrlChange;
            $browser.onUrlChange = function (callback) {
                var proxy = function () {
                    $browser.inHashChange++;
                    try {
                        return callback.apply(this, arguments);
                    } finally {
                        $browser.inHashChange--;
                    }
                };
                _onUrlChange.call(this, proxy);
            };
            return $browser;
        }]);


        $provide.decorator('$location', ['$delegate', function ($location) {
            $location.routeOverride = function (routeOverride) {
                $location.$$routeOverride = routeOverride;
                return this;
            };
            return $location;
        }]);
    }

    $.mobile._registerBrowserDecorator = registerBrowserDecorator;
    mod.config(['$provide', function ($provide) {
        registerBrowserDecorator($provide);
    }]);


    // This needs to be outside of a angular config callback, as jqm reads this during initialization.
    function disableJqmHashChange() {
        $.mobile.pushStateEnabled = false;
        $.mobile.hashListeningEnabled = false;
        $.mobile.linkBindingEnabled = false;
        $.mobile.changePage.defaults.changeHash = false;
        if ($.support.dynamicBaseTag) {
            $.support.dynamicBaseTag = false;
            $.mobile.base.set = function () {};
        }
    }

    disableJqmHashChange();

    // html5 mode is always required, so we are able to allow links like
    // <a href="somePage.html"> to load external pages.
    mod.config(['$locationProvider', function ($locationProvider) {
        $locationProvider.html5Mode(true);
    }]);

    mod.directive('ngView', function () {
        throw new Error("ngView is not allowed and not needed with the jqm adapter.");
    });

    var DEFAULT_JQM_PAGE = 'DEFAULT_JQM_PAGE';

    mod.config(['$routeProvider', function ($routeProvider) {
        var _when = $routeProvider.when;
        $routeProvider.when = function (path, params) {
            createNgmRouting(params);
            return _when.apply(this, arguments);
        };

        $routeProvider.otherwise({
            templateUrl:DEFAULT_JQM_PAGE
        });
    }]);

    function createNgmRouting(routeParams) {
        if (!routeParams.templateUrl) {
            throw new Error("Only routes with templateUrl are allowed!");
        }
        if (routeParams.controller) {
            throw new Error("Controllers are not allowed on routes. However, you may use the onActivate parameter");
        }
    }

    mod.run(['$route', '$rootScope', '$location', '$browser', function ($route, $rootScope, $location, $browser) {
        var originalPath = location.pathname;
        var originalBasePath = getBasePath(originalPath);

        function getBasePath(path) {
            return path.substr(0, path.lastIndexOf('/'));
        }

        var routeOverrideCopyProps = ['templateUrl', 'jqmOptions', 'onActivate'];
        $rootScope.$on('$routeChangeStart', function (event, newRoute) {
            var routeOverride = $location.$$routeOverride;
            delete $location.$$routeOverride;
            if (routeOverride) {
                angular.forEach(routeOverrideCopyProps, function (propName) {
                    if (routeOverride[propName]) {
                        newRoute[propName] = routeOverride[propName];
                    }
                });

                newRoute.resolve = newRoute.resolve || {};
                angular.forEach(routeOverride.locals, function (value, key) {
                    newRoute.resolve[key] = function () {
                        return value;
                    };
                });
            }

            // Prevent angular from loading the template, as jquery mobile already does this!
            newRoute.ngmTemplateUrl = newRoute.templateUrl;
            newRoute.templateUrl = undefined;
        });

        $rootScope.$on('jqmPagebeforeshow', function (event) {
            var current = $route.current;
            if (current && current.onActivate) {
                event.targetScope[current.onActivate].call(event.targetScope, current.locals);
            }
        });

        $rootScope.$on('$routeChangeSuccess', function () {
            var newRoute = $route.current;
            var $document = $(document);

            function getDefaultJqmPageUrl() {
                var hash = $location.hash();
                if (hash) {
                    return "#" + hash;
                } else {
                    var path = $location.path();
                    if (path) {
                        path = originalBasePath + path;
                        return path;
                    }
                }
                return originalPath;
            }

            var url = newRoute.ngmTemplateUrl;
            if (url === DEFAULT_JQM_PAGE) {
                url = getDefaultJqmPageUrl();
            }
            var navConfig = {};
            if ($browser.inHashChange) {
                navConfig.fromHashChange = true;
            }

            if (newRoute.jqmOptions) {
                angular.extend(navConfig, newRoute.jqmOptions);
            }

            if (!$.mobile.pageContainer) {
                $rootScope.$on("jqmInit", startNavigation);
            } else {
                startNavigation();
            }

            function startNavigation() {
                $.mobile.changePage(url, navConfig);
            }
        });
    }]);

})(angular, $);
(function ($, angular) {

    var mod = angular.module("ng");
    mod.config(['$provide', function ($provide) {
        $provide.decorator('$location', ['$delegate', function ($location) {
            $location.back = function () {
                $location.$$back = true;
                return this;
            };
            return $location;
        }]);
    }]);

    /* TODO
    mod.run(['$rootScope', '$location', '$history', function ($rootScope, $location, $history) {
        var urlStack = [];
        var activeIndex = -1;

        $rootScope.$on('$locationChangeStart', function (event, newUrl) {
            if ($location.$$back) {
                delete $location.$$back;


                event.preventDefault();
            }
            // TODO problem, when some one else is rejecting the change
            $location.$$savedReplace = $location.$$replace;
        });
        $rootScope.$on('$locationChangeSuccess', function (event, newUrl) {
            activeIndex = urlStack.indexOf(newUrl);
            if (activeIndex === -1) {
                if ($location.$$savedReplace && urlStack.length) {
                    urlStack[urlStack.length-1] = newUrl;
                } else {
                    urlStack.push(newUrl);
                }
                activeIndex = urlStack.length-1;
            } else {

            }
        });
    }]);

    */

    mod.factory('$history', function () {
        function go(relativeIndex) {
            window.history.go(relativeIndex);
        }

        return {
            go:go
        };
    });
})(window.jQuery, window.angular);
(function ($, angular) {
    // Patch for ng-repeat to fire an event whenever the children change.
    // Only watching Scope create/destroy is not enough here, as ng-repeat
    // caches the scopes during reordering.

    function shallowEquals(collection1, collection2) {
        if (!!collection1 ^ !!collection2) {
            return false;
        }
        for (var x in collection1) {
            if (collection2[x] !== collection1[x]) {
                return false;
            }
        }
        for (var x in collection2) {
            if (collection2[x] !== collection1[x]) {
                return false;
            }
        }
        return true;
    }

    function shallowClone(collection) {
        if (!collection) {
            return collection;
        }
        var res;
        if (collection.length) {
            res = [];
        } else {
            res = {};
        }
        for (var x in collection) {
            res[x] = collection[x];
        }
        return res;
    }

    var mod = angular.module('ng');
    mod.directive('ngRepeat', function () {
        return {
            priority:1000, // same as original repeat
            compile:function (element, attr, linker) {
                return {
                    pre:function (scope, iterStartElement, attr) {
                        var expression = attr.ngRepeat;
                        var match = expression.match(/^.+in\s+(.*)\s*$/);
                        if (!match) {
                            throw Error("Expected ngRepeat in form of '_item_ in _collection_' but got '" +
                                expression + "'.");
                        }
                        var collectionExpr = match[1];
                        var lastCollection;
                        var changeCounter = 0;
                        scope.$watch(function () {
                            var collection = scope.$eval(collectionExpr);
                            if (!shallowEquals(collection, lastCollection)) {
                                lastCollection = shallowClone(collection);
                                changeCounter++;
                            }
                            return changeCounter;
                        }, function () {
                            // Note: need to be parent() as jquery cannot trigger events on comments
                            // (angular creates a comment node when using transclusion, as ng-repeat does).
                            iterStartElement.parent().trigger("$childrenChanged");
                        });
                    }
                };
            }
        };
    });
})($, angular);
(function ($, angular) {
    // This is a copy of parts of angular's ngOptions directive to detect changes in the values
    // of ngOptions (emits the $childrenChanged event on the scope).
    // This is needed as ngOptions does not provide a way to listen to changes.

    function sortedKeys(obj) {
        var keys = [];
        for (var key in obj) {
            if (obj.hasOwnProperty(key)) {
                keys.push(key);
            }
        }
        return keys.sort();
    }

    var NG_OPTIONS_REGEXP = /^\s*(.*?)(?:\s+as\s+(.*?))?(?:\s+group\s+by\s+(.*))?\s+for\s+(?:([\$\w][\$\w\d]*)|(?:\(\s*([\$\w][\$\w\d]*)\s*,\s*([\$\w][\$\w\d]*)\s*\)))\s+in\s+(.*)$/;
    var mod = angular.module('ng');
    mod.directive('ngOptions', ['$parse', function ($parse) {
        return {
            require: ['select', '?ngModel'],
            link:function (scope, element, attr, ctrls) {
                // if ngModel is not defined, we don't need to do anything
                if (!ctrls[1]) return;

                var match;
                var optionsExp = attr.ngOptions;

                if (! (match = optionsExp.match(NG_OPTIONS_REGEXP))) {
                    throw Error(
                        "Expected ngOptions in form of '_select_ (as _label_)? for (_key_,)?_value_ in _collection_'" +
                            " but got '" + optionsExp + "'.");
                }

                var displayFn = $parse(match[2] || match[1]),
                    valueName = match[4] || match[6],
                    keyName = match[5],
                    groupByFn = $parse(match[3] || ''),
                    valueFn = $parse(match[2] ? match[1] : valueName),
                    valuesFn = $parse(match[7]);

                scope.$watch(optionsModel, function() {
                    element.trigger("$childrenChanged");
                }, true);

                function optionsModel() {
                    var optionGroups = [], // Temporary location for the option groups before we render them
                        optionGroupName,
                        values = valuesFn(scope) || [],
                        keys = keyName ? sortedKeys(values) : values,
                        length,
                        index,
                        locals = {};

                    // We now build up the list of options we need (we merge later)
                    for (index = 0; length = keys.length, index < length; index++) {
                        var value = values[index];
                        locals[valueName] = values[keyName ? locals[keyName]=keys[index]:index];
                        optionGroupName = groupByFn(scope, locals);
                        optionGroups.push({
                            id: keyName ? keys[index] : index,   // either the index into array or key from object
                            label: displayFn(scope, locals), // what will be seen by the user
                            optionGroup: optionGroupName
                        });
                    }
                    return optionGroups;
                }
            }
        };
    }]);


})($, angular);
(function (angular) {
    var ng = angular.module("ng");
    ng.directive('option', ['$interpolate', function ($interpolate) {
        return {
            restrict:'E',
            compile:function (tElement, tAttrs) {
                var textInterpolateFn = $interpolate(tElement.text(), true);
                var valueInterpolateFn = $interpolate(tElement.attr('value'), true);
                return function (scope, iElement, iAttrs) {
                    scope.$watch(textInterpolateFn, function () {
                        iElement.trigger("$childrenChanged");
                    });
                    scope.$watch(valueInterpolateFn, function () {
                        iElement.trigger("$childrenChanged");
                    });
                }
            }
        };
    }]);
})(angular);
(function (angular) {
    var ng = angular.module("ng");
    ng.directive('li', function() {
        return {
            restrict:'E',
            compile:function (tElement, tAttrs) {
                return function (scope, iElement, iAttrs) {
                    iElement.bind("$childrenChanged", function () {
                        iElement.removeClass("ui-li");
                        var buttonElements = iElement.data("buttonElements");
                        if (buttonElements) {
                            var text = buttonElements.text;
                            while (text.firstChild) {
                                iElement[0].appendChild(text.firstChild);
                            }
                            $(buttonElements.inner).remove();
                        }
                        iElement.removeData("buttonElements");
                    });
                }
            }
        };
    });
})(angular);
(function (angular) {
    // Patch for ng-switch to fire an event whenever the children change.

    var ng = angular.module("ng");
    ng.directive("ngSwitch",
        function () {
            return {
                restrict:'EA',
                compile:function (element, attr) {
                    var watchExpr = attr.ngSwitch || attr.on;
                    return function (scope, element) {
                        scope.$watch(watchExpr, function (value) {
                            element.trigger("$childrenChanged");
                        });
                    }
                }
            }
        });
})(angular);
(function (angular) {
    // Patch for ng-include to fire an event whenever the children change.

    var ng = angular.module("ng");
    ng.directive("ngInclude",
        function () {
            return {
                restrict:'ECA',
                compile:function (element, attr) {
                    var srcExp = attr.ngInclude || attr.src;
                    return function (scope, element) {
                        scope.$watch(srcExp, function (src) {
                            element.trigger("$childrenChanged");
                        });
                        scope.$on("$includeContentLoaded", function() {
                            element.trigger("$childrenChanged");
                        });
                    }
                }
            }
        });
})(angular);
(function ($, angular) {
    var mod = angular.module('ng');

    function inputDirectivePatch() {
        return {
            restrict:'E',
            require:'?ngModel',
            compile:function (tElement, tAttrs) {
                var type = tElement.attr('type');
                return {
                    pre:function (scope, iElement, iAttrs, ctrl) {
                        if (!ctrl) {
                            return;
                        }
                        var listenToEvents = [];
                        if (type === 'date') {
                            // Angular binds to the input or keydown+change event.
                            // However, date inputs on IOS5 do not fire any of those (only the blur event).
                            // See ios5 bug TODO
                            listenToEvents.push("blur");
                        }
                        // always bind to the change event, if angular would only listen to the "input" event.
                        // Needed as jqm often fires change events when the input widgets change...
                        listenToEvents.push("change");

                        var _bind = iElement.bind;
                        iElement.bind = function (events, callback) {
                            if (events.indexOf('input') != -1 || events.indexOf('change') != -1) {
                                for (var i=0; i<listenToEvents.length; i++) {
                                    var event = listenToEvents[i];
                                    if (events.indexOf(event)===-1) {
                                        events+=" "+event;
                                    }
                                }
                            }
                            return _bind.call(this, events, callback);
                        };
                    }
                }
            }
        };
    }

    mod.directive("input", inputDirectivePatch);
    mod.directive("textarea", inputDirectivePatch);
})($, angular);


(function (angular) {
    /*
     * Defines the ng:if tag. This is useful if jquery mobile does not allow
     * an ng-switch element in the dom, e.g. between ul and li.
     */
    var ngIfDirective = {
        transclude:'element',
        priority:1000,
        terminal:true,
        compile:function (element, attr, linker) {
            return function (scope, iterStartElement, attr) {
                iterStartElement[0].doNotMove = true;
                var expression = attr.ngmIf;
                var lastElement;
                var lastScope;
                scope.$watch(expression, function (newValue) {
                    if (lastElement) {
                        lastElement.remove();
                        lastElement = null;
                    }
                    lastScope && lastScope.$destroy();
                    if (newValue) {
                        lastScope = scope.$new();
                        linker(lastScope, function (clone) {
                            lastElement = clone;
                            iterStartElement.after(clone);
                        });
                    }
                    // Note: need to be parent() as jquery cannot trigger events on comments
                    // (angular creates a comment node when using transclusion, as ng-repeat does).
                    iterStartElement.parent().trigger("$childrenChanged");
                });
            };
        }
    };
    var ng = angular.module('ng');
    ng.directive('ngmIf', function () {
        return ngIfDirective;
    });
})(angular);

(function (angular) {
    var mod = angular.module('ng');

    function registerEventHandler(scope, element, eventType, handler) {
        element.bind(eventType, function (event) {
            var res = scope.$apply(handler, element);
            if (eventType.charAt(0) == 'v') {
                // This is required to prevent a second
                // click event, see
                // https://github.com/jquery/jquery-mobile/issues/1787
                event.preventDefault();
            }
        });
    }

    function createEventDirective(directive, eventType) {
        mod.directive(directive, function () {
            return function (scope, element, attrs) {
                var eventHandler = attrs[directive];
                registerEventHandler(scope, element, eventType, eventHandler);
            };
        });
    }

    // See http://jquerymobile.com/demos/1.2.0/docs/api/events.html
    var jqmEvents = ['tap', 'taphold', 'swipe', 'swiperight', 'swipeleft', 'vmouseover',
        'vmouseout',
        'vmousedown',
        'vmousemove',
        'vmouseup',
        'vclick',
        'vmousecancel',
        'orientationchange',
        'scrollstart',
        'scrollend',
        'pagebeforeshow',
        'pagebeforehide',
        'pageshow',
        'pagehide'
    ];
    var event, directive, i;
    for (i=0; i<jqmEvents.length; i++) {
        event = jqmEvents[i];
        directive = 'ngm' + event.substring(0, 1).toUpperCase() + event.substring(1);
        createEventDirective(directive, event);
    }

})(angular);
(function($, angular) {
    function splitAtFirstColon(value) {
        var pos = value.indexOf(':');
        if (pos===-1) {
            return [value];
        }
        return [
            value.substring(0, pos),
            value.substring(pos+1)
        ];
    }

    var mod = angular.module('ng');
    mod.factory('$navigate', ['$location', '$history', function($location, $history) {
        /*
         * Service for page navigation.
         * @param target has the syntax: [<transition>:]pageId
         * @param activateFunctionName Function to call in the target scope.
         * @param further params Parameters for the function that should be called in the target scope.
         */
        function navigate(target, activateFunctionName, activateParams) {
            var navigateOptions;
            if (typeof target === 'object') {
                navigateOptions = target;
                target = navigateOptions.target;
            }
            var parts = splitAtFirstColon(target);
            var isBack = false;
            if (parts.length === 2 && parts[0] === 'back') {
                isBack = true;
                target = parts[1];
            } else if (parts.length === 2) {
                navigateOptions = { transition: parts[0] };
                target = parts[1];
            }
            if (target === 'back') {
                $history.go(-1);
                return;
            }
            if (isBack) {
                $location.back();
            }
            $location.routeOverride({
                jqmOptions: navigateOptions,
                onActivate: activateFunctionName,
                locals: activateParams
            });
            if (target.charAt(0)==='#') {
                $location.hash(target.substring(1));
            } else {
                $location.path(target);
            }
        }

        return navigate;
    }]);


})($, angular);
(function(angular) {
    var storageName = '$$sharedControllers';

    function storage(rootScope) {
        return rootScope[storageName] = rootScope[storageName] || {};
    }

    function sharedCtrl(rootScope, controllerName, $controller, usedInPage) {
        var store = storage(rootScope);
        var scopeInstance = store[controllerName];
        if (!scopeInstance) {
            scopeInstance = rootScope.$new();
            $controller(controllerName, {$scope: scopeInstance});
            store[controllerName] = scopeInstance;
            scopeInstance.$$referenceCount = 0;
        }
        scopeInstance.$$referenceCount++;
        usedInPage.bind("$destroy", function() {
            scopeInstance.$$referenceCount--;
            if (scopeInstance.$$referenceCount===0) {
                scopeInstance.$destroy();
                delete store[controllerName];
            }
        });
        return scopeInstance;
    }

    function parseSharedControllersExpression(expression) {
        var pattern = /([^\s,:]+)\s*:\s*([^\s,:]+)/g;
        var match;
        var hasData = false;
        var controllers = {};
        while (match = pattern.exec(expression)) {
            hasData = true;
            controllers[match[1]] = match[2];
        }
        if (!hasData) {
            throw "Expression " + expression + " needs to have the syntax <name>:<controller>,...";
        }
        return controllers;
    }

    var mod = angular.module('ng');
    mod.directive('ngmSharedController', ['$controller', function($controller) {
        return {
            scope: true,
            compile: function(element, attrs) {
                var expression = attrs.ngmSharedController;
                var controllers = parseSharedControllersExpression(expression);
                var preLink = function(scope) {
                    for (var name in controllers) {
                        scope[name] = sharedCtrl(scope.$root, controllers[name], $controller, element);
                    }
                };
                return {
                    pre: preLink
                }
            }
        };
    }]);
})(angular);
(function ($, angular) {

    function waitDialogFactory(rootScope) {

        var showCalls = [];

        function onClick(event) {
            var lastCall = showCalls[showCalls.length - 1];
            if (lastCall.callback) {
                rootScope.$apply(function () {
                    lastCall.callback.apply(this, arguments);
                });
            }
            // This is required to prevent a second
            // click event, see
            // https://github.com/jquery/jquery-mobile/issues/1787
            event.preventDefault();
        }

        var loadDialog;

        $(document).delegate(".ui-loader", "vclick", onClick);

        if (!$.mobile.loader.prototype.options.textWithCancel) {
            $.mobile.loader.prototype.options.textWithCancel = 'Loading. Click to cancel.';
        }

        function updateUi() {
            if (showCalls.length > 0) {
                var lastCall = showCalls[showCalls.length - 1];
                var msg = lastCall.msg;
                if (msg) {
                    $.mobile.loading('show', {text:msg, textVisible:!!msg});
                } else {
                    $.mobile.loading('show');
                }
            } else {
                $.mobile.loading('hide');
            }
        }

        /**
         * jquery mobile hides the wait dialog when pages are transitioned.
         * This immediately closes wait dialogs that are opened in the pagebeforeshow event.
         */
        $('div').live('pageshow', function (event, ui) {
            updateUi();
        });

        /**
         *
         * @param msg (optional)
         * @param tapCallback (optional)
         */
        function show() {
            var msg, tapCallback;
            if (typeof arguments[0] == 'string') {
                msg = arguments[0];
            }
            if (typeof arguments[0] == 'function') {
                tapCallback = arguments[0];
            }
            if (typeof arguments[1] == 'function') {
                tapCallback = arguments[1];
            }

            showCalls.push({msg:msg, callback:tapCallback});
            updateUi();
        }

        function hide() {
            showCalls.pop();
            updateUi();
        }

        function always(promise, callback) {
            promise.then(callback, callback);
        }

        /**
         *
         * @param promise
         * @param msg (optional)
         */
        function waitFor(promise, msg) {
            show(msg);
            always(promise, function () {
                hide();
            });
        }

        /**
         *
         * @param deferred
         * @param cancelData
         * @param msg (optional)
         */
        function waitForWithCancel(deferred, cancelData, msg) {
            if (!msg) {
                msg = $.mobile.loader.prototype.options.textWithCancel;
            }
            show(msg, function () {
                deferred.reject(cancelData);
            });
            always(deferred.promise, function () {
                hide();
            });
        }

        return {
            show:show,
            hide:hide,
            waitFor:waitFor,
            waitForWithCancel:waitForWithCancel
        };
    }

    var mod = angular.module('ng');
    mod.factory('$waitDialog', ['$rootScope', waitDialogFactory]);
})($, angular);
(function ($, angular) {

    function pagedListFilterFactory(defaultListPageSize) {

        return function (list, stateProperty, operator) {
            if (!list) {
                return list;
            }
            if (!stateProperty) {
                throw new Error("Missing pager property");
            }
            var scope = this;
            var state = scope[stateProperty];
            if (!state) {
                state = scope[stateProperty] = {
                    loadMore: function() {
                        this.loadMoreCalled = true;
                    }
                };
            }
            var pageSize = operator ? (+operator) : defaultListPageSize;
            var endIndex = state.endIndex || pageSize;
            if (state.loadMoreCalled) {
                state.loadMoreCalled = false;
                endIndex += pageSize;
            }
            if (endIndex >= list.length) {
                endIndex = list.length;
            }
            if (endIndex < pageSize) {
                endIndex = pageSize;
            }
            state.hasMore = endIndex < list.length;
            state.endIndex = endIndex;
            state.cache = list.slice(0, endIndex);
            return state.cache;
        }
    }

    pagedListFilterFactory.$inject = ['defaultListPageSize'];
    var mod = angular.module(['ng']);
    mod.constant('defaultListPageSize', 10);
    mod.filter('paged', pagedListFilterFactory);
})($, angular);
});