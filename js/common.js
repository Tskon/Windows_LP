(function (factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery'], factory);
    } else if (typeof exports === 'object') {
        // Node/CommonJS
        factory(require('jquery'));
    } else {
        // Browser globals
        factory(jQuery);
    }
}(function ($) {

    var ua = navigator.userAgent,
        iPhone = /iphone/i.test(ua),
        chrome = /chrome/i.test(ua),
        android = /android/i.test(ua),
        caretTimeoutId;

    $.mask = {
        //Predefined character definitions
        definitions: {
            '9': "[0-9]",
            'a': "[A-Za-z]",
            '*': "[A-Za-z0-9]"
        },
        autoclear: true,
        dataName: "rawMaskFn",
        placeholder: '_'
    };

    $.fn.extend({
        //Helper Function for Caret positioning
        caret: function (begin, end) {
            var range;

            if (this.length === 0 || this.is(":hidden") || this.get(0) !== document.activeElement) {
                return;
            }

            if (typeof begin == 'number') {
                end = (typeof end === 'number') ? end : begin;
                return this.each(function () {
                    if (this.setSelectionRange) {
                        this.setSelectionRange(begin, end);
                    } else if (this.createTextRange) {
                        range = this.createTextRange();
                        range.collapse(true);
                        range.moveEnd('character', end);
                        range.moveStart('character', begin);
                        range.select();
                    }
                });
            } else {
                if (this[0].setSelectionRange) {
                    begin = this[0].selectionStart;
                    end = this[0].selectionEnd;
                } else if (document.selection && document.selection.createRange) {
                    range = document.selection.createRange();
                    begin = 0 - range.duplicate().moveStart('character', -100000);
                    end = begin + range.text.length;
                }
                return {begin: begin, end: end};
            }
        },
        unmask: function () {
            return this.trigger("unmask");
        },
        mask: function (mask, settings) {
            var input,
                defs,
                tests,
                partialPosition,
                firstNonMaskPos,
                lastRequiredNonMaskPos,
                len,
                oldVal;

            if (!mask && this.length > 0) {
                input = $(this[0]);
                var fn = input.data($.mask.dataName)
                return fn ? fn() : undefined;
            }

            settings = $.extend({
                autoclear: $.mask.autoclear,
                placeholder: $.mask.placeholder, // Load default placeholder
                completed: null
            }, settings);


            defs = $.mask.definitions;
            tests = [];
            partialPosition = len = mask.length;
            firstNonMaskPos = null;

            mask = String(mask);

            $.each(mask.split(""), function (i, c) {
                if (c == '?') {
                    len--;
                    partialPosition = i;
                } else if (defs[c]) {
                    tests.push(new RegExp(defs[c]));
                    if (firstNonMaskPos === null) {
                        firstNonMaskPos = tests.length - 1;
                    }
                    if (i < partialPosition) {
                        lastRequiredNonMaskPos = tests.length - 1;
                    }
                } else {
                    tests.push(null);
                }
            });

            return this.trigger("unmask").each(function () {
                var input = $(this),
                    buffer = $.map(
                        mask.split(""),
                        function (c, i) {
                            if (c != '?') {
                                return defs[c] ? getPlaceholder(i) : c;
                            }
                        }),
                    defaultBuffer = buffer.join(''),
                    focusText = input.val();

                function tryFireCompleted() {
                    if (!settings.completed) {
                        return;
                    }

                    for (var i = firstNonMaskPos; i <= lastRequiredNonMaskPos; i++) {
                        if (tests[i] && buffer[i] === getPlaceholder(i)) {
                            return;
                        }
                    }
                    settings.completed.call(input);
                }

                function getPlaceholder(i) {
                    if (i < settings.placeholder.length)
                        return settings.placeholder.charAt(i);
                    return settings.placeholder.charAt(0);
                }

                function seekNext(pos) {
                    while (++pos < len && !tests[pos]) ;
                    return pos;
                }

                function seekPrev(pos) {
                    while (--pos >= 0 && !tests[pos]) ;
                    return pos;
                }

                function shiftL(begin, end) {
                    var i,
                        j;

                    if (begin < 0) {
                        return;
                    }

                    for (i = begin, j = seekNext(end); i < len; i++) {
                        if (tests[i]) {
                            if (j < len && tests[i].test(buffer[j])) {
                                buffer[i] = buffer[j];
                                buffer[j] = getPlaceholder(j);
                            } else {
                                break;
                            }

                            j = seekNext(j);
                        }
                    }
                    writeBuffer();
                    input.caret(Math.max(firstNonMaskPos, begin));
                }

                function shiftR(pos) {
                    var i,
                        c,
                        j,
                        t;

                    for (i = pos, c = getPlaceholder(pos); i < len; i++) {
                        if (tests[i]) {
                            j = seekNext(i);
                            t = buffer[i];
                            buffer[i] = c;
                            if (j < len && tests[j].test(t)) {
                                c = t;
                            } else {
                                break;
                            }
                        }
                    }
                }

                function androidInputEvent(e) {
                    var curVal = input.val();
                    var pos = input.caret();
                    var proxy = function () {
                        $.proxy($.fn.caret, input, pos.begin, pos.begin)();
                    };

                    if (oldVal && oldVal.length && oldVal.length > curVal.length) {
                        // a deletion or backspace happened
                        var nextPos = checkVal(true);
                        var curPos = pos.end;
                        while (curPos > 0 && !tests[curPos - 1]) {
                            curPos--;
                        }
                        if (curPos === 0) {
                            curPos = nextPos;
                        }
                        pos.begin = curPos;
                        setTimeout(function () {
                            proxy();
                            tryFireCompleted();
                        }, 0);
                    } else {
                        pos.begin = checkVal(true);
                        setTimeout(function () {
                            proxy();
                            tryFireCompleted();
                        }, 0);
                    }
                }


                function blurEvent(e) {
                    checkVal();

                    if (input.val() != focusText)
                        input.change();
                }

                function keydownEvent(e) {
                    if (input.prop("readonly")) {
                        return;
                    }

                    var k = e.which || e.keyCode,
                        pos,
                        begin,
                        end;
                    oldVal = input.val();
                    //backspace, delete, and escape get special treatment
                    if (k === 8 || k === 46 || (iPhone && k === 127)) {
                        pos = input.caret();
                        begin = pos.begin;
                        end = pos.end;

                        if (end - begin === 0) {
                            begin = k !== 46 ? seekPrev(begin) : (end = seekNext(begin - 1));
                            end = k === 46 ? seekNext(end) : end;
                        }
                        clearBuffer(begin, end);
                        shiftL(begin, end - 1);

                        e.preventDefault();
                    } else if (k === 13) { // enter
                        blurEvent.call(this, e);
                    } else if (k === 27) { // escape
                        input.val(focusText);
                        input.caret(0, checkVal());
                        e.preventDefault();
                    }
                }

                function keypressEvent(e) {
                    if (input.prop("readonly")) {
                        return;
                    }

                    var k = e.which || e.keyCode,
                        pos = input.caret(),
                        p,
                        c,
                        next;
                    if (e.ctrlKey || e.altKey || e.metaKey || k < 32) {//Ignore
                        return;
                    } else if (k && k !== 13) {
                        if (pos.end - pos.begin !== 0) {
                            clearBuffer(pos.begin, pos.end);
                            shiftL(pos.begin, pos.end - 1);
                        }

                        p = seekNext(pos.begin - 1);
                        if (p < len) {
                            c = String.fromCharCode(k);
                            if (tests[p].test(c)) {
                                shiftR(p);

                                buffer[p] = c;
                                writeBuffer();
                                next = seekNext(p);

                                if (android) {
                                    //Path for CSP Violation on FireFox OS 1.1
                                    var proxy = function () {
                                        $.proxy($.fn.caret, input, next)();
                                    };

                                    setTimeout(proxy, 0);
                                } else {
                                    input.caret(next);
                                }
                                if (pos.begin <= lastRequiredNonMaskPos) {
                                    tryFireCompleted();
                                }
                            }
                        }
                        e.preventDefault();
                    }
                }

                function clearBuffer(start, end) {
                    var i;
                    for (i = start; i < end && i < len; i++) {
                        if (tests[i]) {
                            buffer[i] = getPlaceholder(i);
                        }
                    }
                }

                function writeBuffer() {
                    input.val(buffer.join(''));
                }

                function checkVal(allow) {
                    //try to place characters where they belong
                    var test = input.val(),
                        lastMatch = -1,
                        i,
                        c,
                        pos;

                    for (i = 0, pos = 0; i < len; i++) {
                        if (tests[i]) {
                            buffer[i] = getPlaceholder(i);
                            while (pos++ < test.length) {
                                c = test.charAt(pos - 1);
                                if (tests[i].test(c)) {
                                    buffer[i] = c;
                                    lastMatch = i;
                                    break;
                                }
                            }
                            if (pos > test.length) {
                                clearBuffer(i + 1, len);
                                break;
                            }
                        } else {
                            if (buffer[i] === test.charAt(pos)) {
                                pos++;
                            }
                            if (i < partialPosition) {
                                lastMatch = i;
                            }
                        }
                    }
                    if (allow) {
                        writeBuffer();
                    } else if (lastMatch + 1 < partialPosition) {
                        if (settings.autoclear || buffer.join('') === defaultBuffer) {
                            // Invalid value. Remove it and replace it with the
                            // mask, which is the default behavior.
                            if (input.val()) input.val("");
                            clearBuffer(0, len);
                        } else {
                            // Invalid value, but we opt to show the value to the
                            // user and allow them to correct their mistake.
                            writeBuffer();
                        }
                    } else {
                        writeBuffer();
                        input.val(input.val().substring(0, lastMatch + 1));
                    }
                    return (partialPosition ? i : firstNonMaskPos);
                }

                input.data($.mask.dataName, function () {
                    return $.map(buffer, function (c, i) {
                        return tests[i] && c != getPlaceholder(i) ? c : null;
                    }).join('');
                });


                input
                    .one("unmask", function () {
                        input
                            .off(".mask")
                            .removeData($.mask.dataName);
                    })
                    .on("focus.mask", function () {
                        if (input.prop("readonly")) {
                            return;
                        }

                        clearTimeout(caretTimeoutId);
                        var pos;

                        focusText = input.val();

                        pos = checkVal();

                        caretTimeoutId = setTimeout(function () {
                            if (input.get(0) !== document.activeElement) {
                                return;
                            }
                            writeBuffer();
                            if (pos == mask.replace("?", "").length) {
                                input.caret(0, pos);
                            } else {
                                input.caret(pos);
                            }
                        }, 10);
                    })
                    .on("blur.mask", blurEvent)
                    .on("keydown.mask", keydownEvent)
                    .on("keypress.mask", keypressEvent)
                    .on("input.mask paste.mask", function () {
                        if (input.prop("readonly")) {
                            return;
                        }

                        setTimeout(function () {
                            var pos = checkVal(true);
                            input.caret(pos);
                            tryFireCompleted();
                        }, 0);
                    });
                if (chrome && android) {
                    input
                        .off('input.mask')
                        .on('input.mask', androidInputEvent);
                }
                checkVal(); //Perform initial check for existing values
            });
        }
    });
}));
// slickDynamic extension for Slick carousel by vereschak@gmail.com
(function ($) {
    $.fn.slickDynamic = function (options, breakpoints) {
        var bs = $.extend({
            "maxWidth": 1100,
            "getWidth": $(window).width
        }, breakpoints);
        var slider = this;
        slider.attr('data-dynamic', 'offslider');
        slider.resize = function () {
            slider.each(function (index, el) {
                var self = $(this);
                if (bs.getWidth() < bs.maxWidth && !self.hasClass('slick-slider')) {
                    self.slick(options);
                    self.attr('data-dynamic', 'onslider');
                } else if (bs.getWidth() >= bs.maxWidth && self.hasClass('slick-slider')) {
                    self.slick('unslick');
                    self.attr('data-dynamic', 'offslider');
                }
            });
        };
        (function (slider) {
            $(window).on("resize", slider.resize.bind(slider));
        })(slider);
        slider.resize();
        return slider;
    };
})(jQuery);

// Viewport detection function
var viewport = (function () {
    var obj = {};
    obj.width = function () {
        var e = window,
            a = 'inner';
        if (!('innerWidth' in window)) {
            a = 'client';
            e = document.documentElement || document.body;
        }
        // console.log("width");
        return e[a + 'Width'];
    };
    obj.height = function () {
        var e = window,
            a = 'inner';
        if (!('innerWidth' in window)) {
            a = 'client';
            e = document.documentElement || document.body;
        }
        return e[a + 'Height'];
    };
    return obj;
})();

$(document).ready(function () {
    $(".wrap_list_example ul").slickDynamic({
        slidesToShow: 2,
        slidesToScroll: 1,
        dots: false,
        responsive: [{
            breakpoint: 760,
            settings: {
                slidesToShow: 1
            }
        }]
    }, {
        getWidth: viewport.width
    });

    $('.navbar_toggle').click(function () {
        $(this).toggleClass('active');
        $('.navbar_collapse').slideToggle();
    });
    if ($(window).width() < 768) {
        $('.navbar_collapse ul a').click(function () {
            $('.navbar_toggle').removeClass('active');
            $('.navbar_collapse').slideToggle();
        });
    }
    $("input[type='tel']").mask("+7(999) 999-99-99");
    $(".various").fancybox();
    $(".fancybox").fancybox();
    $("form").each(function () { //Change
        var th = $(this);
        th.validate({
            rules: {
                phone: {
                    required: true
                }
            },
            messages: {},
            errorPlacement: function (error, element) {
            },
            submitHandler: function (form) {
                var thisForm = $(form);
                // console.log(thisForm.serialize());
                $.ajax({
                    type: "POST",
                    url: "mail.php", //Change
                    data: th.serialize()
                }).done(function () {
                    // Done Functions

                    $.fancybox.open([{
                        href: '#thanks',
                    }]);

                    setTimeout(function () {
                        //submitForm = false
                        $.fancybox.close();
                    }, 3000);

                    th.trigger("reset");
                });
                return false;
            },

            success: function () {
            },
            highlight: function (element, errorClass) {
                $(element).addClass('error');
            },
            unhighlight: function (element, errorClass, validClass) {
                $(element).removeClass('error');
            }
        })
    });
    $(' .navigation  li a[href*="#"]:not([href="#"]), .target_btn[href*="#"]:not([href="#"])').click(function () {
        if (location.pathname.replace(/^\//, '') == this.pathname.replace(/^\//, '') && location.hostname == this.hostname) {
            var target = $(this.hash);
            var h = $('header').outerHeight();
            target = target.length ? target : $('[name=' + this.hash.slice(1) + ']');
            if (target.length) {
                $('html, body').animate({
                    scrollTop: target.offset().top - h
                }, 1000);
                return false;
            }
        }
    });
    marTopSection();
    $('#map').on('click', '.callback_link', function () {
        $.fancybox({
            href: '#callback'
        });
    });
    giftHandler();
    setMetrikaTargets();
});


function marTopSection() {
    var h = $('header').outerHeight();
    $('header').next('section').css('margin-top', h);
}

// ya-metrika-targets
function setMetrikaTargets() {
    //Заявка
    var submitOrder = document.querySelector('#section1 > div > div > div > div.wrap_form_content_section1 > div > div > form > button');
    var inputThemeOrder = document.querySelector('#section1 > div > div > div > div.wrap_form_content_section1 > div > div > form > div:nth-child(4) > textarea');
    var inputPhoneOrder = document.querySelector('#section1 > div > div > div > div.wrap_form_content_section1 > div > div > form > div:nth-child(6) > input');

    submitOrder.addEventListener('click', function () {
        if (inputThemeOrder.value != '' && inputPhoneOrder.value != '') {
            yaCounter46918845.reachGoal('order');
            ga('send', 'event', 'form', 'submit');
            $('.giftWrapper').fadeOut();
        }
    });

    //Звонок
    var submitRing = document.querySelector('#callback > div > div > div > form > button');
    var inputNameRing = document.querySelector('#callback > div > div > div > form > div:nth-child(3) > input');
    var inputPhoneRing = document.querySelector('#callback > div > div > div > form > div:nth-child(4) > input');

    submitRing.addEventListener('click', function () {
        if (inputPhoneRing.value != '' && inputNameRing.value != '') {
            yaCounter46918845.reachGoal('zvonok');
            ga('send', 'event', 'ring', 'submit');
            $('.giftWrapper').fadeOut();
        }
    });
}

function showGift() {
    var wrapper = document.querySelector('.giftWrapper');
    if ($(window).width() <= '768' || isMobile()) {
        $(wrapper).fadeOut('fast');
    } else {
        $(wrapper).fadeIn({
            start: function () {
                wrapper.style.display = "flex";
            }
        });
    }
}

$(window).resize(showGift);

function giftHandler() {
    var giftShowBtn = document.querySelector('.gift__showButton');
    var giftWrapper = document.querySelector('.giftWrapper');
    var giftContent = document.querySelector('.gift');
    var toggleBtn = document.querySelector('.gift__toggle');

    setTimeout(function () {
        showGift();
    }, 10000);

    giftShowBtn.addEventListener('click', function () {
        giftWrapper.classList.toggle('gift_active');
    });
    toggleBtn.addEventListener('click', function () {
        $(giftContent).fadeOut({
            duration: 'fast', complete: function () {
                $('.gift > div').html('');
                $('.gift .gift__form').show();
                $(giftContent).fadeIn('fast');
            }
        });

        var submitBtn = document.querySelector('.giftWrapper.gift_active > div.gift > form > button');
        submitBtn.addEventListener('click', function () {
            var inputName = document.querySelector('.giftWrapper.gift_active > div.gift > form > div:nth-child(3) > input');
            var inputPhone = document.querySelector('.giftWrapper.gift_active > div.gift > form > div:nth-child(4) > input');
            if (inputPhone.value != '' && inputName.value != '') {
                yaCounter46918845.reachGoal('order');
                $('.giftWrapper').fadeOut();
            }
        });
    });
}

function isMobile() {
    var isMobile = false; //initiate as false
// device detection
    if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|ipad|iris|kindle|Android|Silk|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(navigator.userAgent)
        || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(navigator.userAgent.substr(0, 4))) isMobile = true;
    return isMobile;
}