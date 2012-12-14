(function($) {
    var transitionEndEvent = (function() {
        var el = document.createElement('fakeelement');

        var transitions = {
            'transition': 'transitionEnd',
            'OTransition': 'oTransitionEnd',
            'MSTransition': 'msTransitionEnd',
            'MozTransition': 'transitionend',
            'WebkitTransition': 'webkitTransitionEnd'
        };

        for (var t in transitions) {
            if (el.style[t] !== undefined) return transitions[t];
        }
    })();

    // no-op placeholders will be replace on document ready
    window.SideSwipe = {
        toggle: function(which) {},
        close: function() {}
    };

    var opened = false;
    var moving = false;
    var transition = false;
    var container, panels; // initialized on document ready

    function open(panel) {
        if (opened !== false && opened[0] !== panel[0]) return;

        opened = panel.addClass('SideSwipe-open');

        var width = panel.width();
        if (panel.hasClass('SideSwipe-right')) width = -width;

        transition = 'open';
        container.addClass('SideSwipe-transition');

        panels.main
            .css(
                'webkitTransform', 
                'translate3d(' + width +'px, 0, 0)'
            )
            .one(transitionEndEvent, function() {
                if (transition === 'open') {
                    container.removeClass('SideSwipe-transition');
                    transition = false;
                }
            });
    }

    function close() {
        transition = 'close';
        container.addClass('SideSwipe-transition');

        panels.main
            .css('webkitTransform', 'translate3d(0,0,0)')
            .one(transitionEndEvent, function() {
                if (transition === 'close') {
                    container.removeClass('SideSwipe-transition');
                    if (opened !== false) {
                        opened.removeClass('SideSwipe-open');
                        opened = false;
                    }
                    transition = false;
                }
            });
    }

    // class to track movement state during a touch event
    var State = function(event) {
        this.start = State.save_time_and_position(event);
        this.last = this.panel = this.velocity = undefined;
        this.scrolling = false;
        this.max = 0;
        this.m41 = (new WebKitCSSMatrix(panels.main.css('webkitTransform')))['m41'];
        this.distance = {};
    };

    State.save_time_and_position = function(event) {
        var data = event.originalEvent.touches ?
            event.originalEvent.touches[0] : event;

        return {
            time: (new Date()).getTime(),
            coords: [ data.pageX, data.pageY ]
        };
    }

    State.prototype.boundedXLeft = function() {
        return Math.max(0, Math.min(this.distance.x, this.max));
    };

    State.prototype.boundedXRight = function() {
        return Math.min(0, Math.max(this.distance.x, -this.max));
    };

    State.prototype.update = function(event) {
        if (this.scrolling) return;

        var current = State.save_time_and_position(event);

        if (this.last) {
            var dx = current.coords[0] - this.last.coords[0];
            var dt = current.time - this.last.time;
            this.velocity = dx / dt;
        }

        this.last = current;

        this.distance.x = this.last.coords[0] - this.start.coords[0];
        this.distance.y = Math.abs(this.last.coords[1] - this.start.coords[1]);

        if (!this.panel) {
            if (this.distance.x === 0 && this.distance.y === 0) return;

            if (this.distance.y > Math.abs(this.distance.x)) {
                if ((panels.main[0] === event.target ||
                     panels.main[0] === $(event.target).parents('.SideSwipe-main')[0])
                    && opened !== false
                    && transition === false)
                {
                    if (this.distance.x === 0) {
                        event.preventDefault();
                        return;
                    }
                } else {
                    this.scrolling = true;
                    return;
                }
            }

            if (opened !== false) {
                this.panel = opened;
                // invert the boundedX logic as we're closing
                // the panel, rather than opening it.
                this.boundedX = opened[0] === panels.left[0] ?
                    this.boundedXRight : this.boundedXLeft;
            } else {
                if (this.distance.x < 0) {
                    this.panel = panels.right;
                    this.boundedX = this.boundedXRight;
                } else {
                    this.panel = panels.left;
                    this.boundedX = this.boundedXLeft;
                }
            }

            this.max = this.panel.width();
            this.panel.addClass('SideSwipe-open');
        }

        // prevent scrolling
        event.preventDefault();

        panels.main.css(
            'webkitTransform',
            'translate3d(' + (this.boundedX() + this.m41) + 'px, 0 , 0)'
        );
    };

    State.prototype.finish = function(event) {
        if (this.scrolling || this.panel) 
            event.preventDefault();

        if (this.panel) {
            if (Math.abs(this.velocity) > 1) {
                
                // flip velocity for right panel for open/close test
                if (this.panel[0] === panels.right[0]) this.velocity *= -1;
                
                if (this.velocity > 0) open(this.panel);
                else close();

            } else {
                var fraction = Math.abs(this.boundedX()) / this.max;
                
                // flip fraction when already open
                if (opened !== false) fraction = 1.0 - fraction;

                if (fraction > 0.3) open(this.panel);
                else close();
            }

            this.panel = undefined;
        }

        this.scrolling = true;
    };

    $(function() {
        // get references to container and panels.
        container = $('.SideSwipe').first();
        panels = {
            main: container.find('.SideSwipe-panel.SideSwipe-main').first(),
            left: container.find('.SideSwipe-panel.SideSwipe-left').first(),
            right: container.find('.SideSwipe-panel.SideSwipe-right').first()
        };

        // when a side panel is fully open, a tap on the visible
        // portion of the main panel should close the panel.
        panels.main.on('tap', function(event) {
            if (!event.isDefaultPrevented()
                && opened !== false
                && moving === false
                && transition === false)
            {
                close();
                event.preventDefault();
            }
        });

        container.bind('touchstart', function(event) {
            if (moving) return;

            moving = true;
            container.addClass('SideSwipe-moving');

            var state = new State(event);

            // wrapper to preserve binding of this and
            // allow us to unbind the it on completion.
            function movement(event) { return state.update(event) }

            container
                .bind('touchmove', movement)
                .one('touchend', function(event) {
                    container
                        .unbind('touchmove', movement)
                        .removeClass('SideSwipe-moving');
                    state.finish(event);
                    state = undefined;
                    moving = false;
                });
        });

        // bind real functions to public API.
        window.SideSwipe = {
            toggle: function(which) {
                var panel = panels[which];
                if (opened === false) open(panel);
                else if (opened[0] === panel[0]) close();
            },
            close: close
        };
    });

})(jQuery);
