(function () {

const SOURCES = {
	sgJQuery: ScrapeMate.baseURL + '/vendor/jquery-1.3.1.min.js',
	diff_match_patch: ScrapeMate.baseURL + '/vendor/diff_match_patch.js',
	sg: ScrapeMate.baseURL + '/vendor/selectorgadget_combined.min.js',
	sgCss: ScrapeMate.baseURL + '/vendor/selectorgadget_combined.css',
	lodash: ScrapeMate.baseURL + '/vendor/lodash.min.js',
	iframe: ScrapeMate.baseURL + '/sidebar-iframe.html',
	common: ScrapeMate.baseURL + '/common.js',
	mainCss: ScrapeMate.baseURL + '/main.css'
}

let selectorGadget, sidebarIFrame, _;
let jsDisabled = false;

function injectScripts (urls, callback) {
	let script = document.createElement('script');

	let cb = callback;
	if (urls.length > 1) {
		cb = () => injectScripts(urls.slice(1), callback);
	}

	script.addEventListener('load', cb);
	script.src = urls[0];
    document.head.appendChild(script);
}

function injectElement (target, type, attrs) {
	var el = document.createElement(type);
	Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    target.appendChild(el);
    return el;
}

function injectCSS (url) {
	return injectElement(document.head, 'link', {
		rel: 'stylesheet',
		type: 'text/css',
		href: url
	});
}

function disablePicker () {
	if (!selectorGadget) return;
	sidebarIFrame.classList.remove('ScrapeMate_picking');
	selectorGadget.unbindAndRemoveInterface()
	selectorGadget = null;
	// on repeated initialization of SelectorGadget it doesn't unbind his events himself
	window.jQuerySG(document).add('*').unbind('.sg');
}

function enablePicker () {
	sidebarIFrame.classList.add('ScrapeMate_picking');
	selectorGadget = new SelectorGadget();
	selectorGadget.makeInterface()
	selectorGadget.clearEverything()
	selectorGadget.setMode('interactive')
	selectorGadget.sg_div[0].style = 'right: -9999px !important;';
}

function xpath (expr, parent) {
    let iter = document.evaluate(expr, parent || document, null, XPathResult.ANY_TYPE, null);
	let node = iter.iterateNext();
	let nodes = [];

    while (node) {
        nodes.push(node);
        node = iter.iterateNext();
    }

    return nodes;
}

function select (sel) {
	try {
		return _.slice(document.querySelectorAll(sel));
	} catch (e) {}
	try {
		return xpath(sel);
	} catch (e) {}
	return false;
}

function loadResources() {
	return new Promise(function (resolve) {
		if (ScrapeMate.loaded) {
			_ = ScrapeMate.lodash;
			resolve();
			return;
		}

		injectCSS(SOURCES.sgCss);
		injectCSS(SOURCES.mainCss);
		injectScripts([SOURCES.sg, SOURCES.lodash, SOURCES.common], function () {
			_ = window._.noConflict();
			ScrapeMate.lodash = _;
			ScrapeMate.loaded = true;
			resolve();
		});
	});
}

function onKeyUp (e) {
	if (e.keyCode === 27) {
		// esc
		disablePicker();
		ScrapeMate.messageBus.sendMessage('pickerDisabled');
	} else if (_.includes([8,46], e.keyCode)) {
		// delete, backspace
		ScrapeMate.messageBus.sendMessage('resetSelector');
	}
}

function initUI (cb) {
	// inject sidebar
	sidebarIFrame = injectElement(document.body, 'iframe', {src: SOURCES.iframe, id: 'ScrapeMate'});

	// setup communication with sidebar
	ScrapeMate.messageBus.attach(sidebarIFrame.contentWindow);
	ScrapeMate.messageBus.listeners = messageListeners;
}

const messageListeners = {

	disablePicker: disablePicker,
	enablePicker: enablePicker,

	closeAll: function () {
		ScrapeMate.messageBus.detach();
		disablePicker();
		document.body.removeChild(sidebarIFrame);
	},

	sidebarInitialized: function () {
		if (jsDisabled) ScrapeMate.messageBus.sendMessage('jsDisabled');
	},

	togglePosition: function () {
		sidebarIFrame.classList.toggle('ScrapeMate_left');
	},

    changeSelectorPicked: function (selector) {
		// replaces selector currently generated by SelectorGadget

        if (!selectorGadget) return;
        selectorGadget.path_output_field.value = selector;
        selectorGadget.refreshFromPath();
    },

    checkSelectors: function (selectors, respond) {
        data = {};
        selectors.forEach(sel => {
			if (!sel) {
				data[sel] = 0;
				return;
			}
			let elems = select(sel);
			data[sel] = elems ? elems.length : -1;
		})
		respond(data);
	},

	location: function (data, respond) {
		respond(location.href);
	},

	disableJs: function () {
		fetch(location, {credentials: 'include'})
		.then(function (resp) {
			return resp.text();
		})
		.then(function (text) {
			document.documentElement.innerHTML = text;
			injectCSS(SOURCES.sgCss);
			injectCSS(SOURCES.mainCss);
			ScrapeMate.messageBus.detach();
			jsDisabled = true;
			initUI();
		});
	},

	getSelElemAttrs: function (selector, respond) {
		// selector -> [{attr:val, attr:val...}, ...]

		let selected;

		selected = select(selector) || [];

		let elems = [];
		_.forEach(selected, el => {
			let attrs = {};
			_.forEach(el.attributes, attr => {
				attrs[attr.name] = attr.value;
			});

			let ownText = _.filter(el.childNodes, el => el.nodeType === Node.TEXT_NODE)
							.map(node => node.data);

			attrs['nodeType'] = el.tagName.toLowerCase();
			if (el.innerHTML) attrs['html'] = el.innerHTML;
			if (ownText.length) attrs['ownText'] = ownText;

			if (attrs['class'])
				attrs['class'] = attrs['class'].replace(/\s*(ScrapeMate_\S+|selectorgadget_\S+)\s*/g, '');
			if (!attrs['class'])
				delete attrs['class'];

			elems.push(attrs);
		});

		respond(elems);
	},

	highlight: function (selector) {
		this.unhighlight();
		_.forEach(select(selector) || [], el => el.classList.add('ScrapeMate_highlighted'));
    },

	unhighlight: function () {
		_.forEach(document.querySelectorAll('.ScrapeMate_highlighted'),
					el => el.classList.remove('ScrapeMate_highlighted'));
	}

};

function main () {
    if (document.querySelector('#ScrapeMate')) {
		ScrapeMate.messageBus.detach();
		ScrapeMate.messageBus.attach(window);
		ScrapeMate.messageBus.sendMessage('closeAll');
        return;
	}

	loadResources().then(function () {
		initUI();

		// setup hotkeys
		window.addEventListener('keyup', onKeyUp);

		// try to avoid selecting our own iframe
		if (!SelectorGadget.prototype.highlightIframeOrig)
			SelectorGadget.prototype.highlightIframeOrig = SelectorGadget.prototype.highlightIframe;
		SelectorGadget.prototype.highlightIframe = function (elem, click) {
			if (elem[0] === sidebarIFrame) return;
			return SelectorGadget.prototype.highlightIframeOrig.call(this, elem, click);
		};

		// hook into SelectorGadget selector update to send updates to our sidebar
		if (!SelectorGadget.prototype.sgMousedownOrig)
			SelectorGadget.prototype.sgMousedownOrig = SelectorGadget.prototype.sgMousedown;
		SelectorGadget.prototype.sgMousedown = function (e) {
			let ret = SelectorGadget.prototype.sgMousedownOrig.call(this, e);
			let sel = selectorGadget.path_output_field.value;
			ScrapeMate.messageBus.sendMessage('selectorPicked', sel);
			return ret;
		};
	});
}

main();

})();
