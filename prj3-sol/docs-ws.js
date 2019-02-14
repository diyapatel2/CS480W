'use strict';

const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const process = require('process');
const url = require('url');
const queryString = require('querystring');

const OK = 200;
const CREATED = 201;
const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const CONFLICT = 409;
const SERVER_ERROR = 500;


//Main URLs
const DOCS = '/docs';
const COMPLETIONS = '/completions';

//Default value for count parameter
const COUNT = 5;

/** Listen on port for incoming requests.  Use docFinder instance
 *  of DocFinder to access document collection methods.
 */
function serve(port, docFinder) {
	const app = express();
	app.locals.port = port;
	app.locals.finder = docFinder;
	setupRoutes(app);
	const server = app.listen(port, async function() {
			console.log(`PID ${process.pid} listening on port ${port}`);
			});
	return server;
}

module.exports = { serve };

function setupRoutes(app) {
	app.use(cors());            //for security workaround in future projects
	app.use(bodyParser.json()); //all incoming bodies are JSON

	//@TODO: add routes for required 4 services
	// app.get(`${DOCS}`, doSomething(app));
	app.get(`${DOCS}/:id`, doGet(app));
	app.get(`${DOCS}`,doSearch(app));
	app.post(`${DOCS}`,doAdd(app));
	app.get(`${COMPLETIONS}`,complete(app));

	app.use(doErrors()); //must be last; setup for server errors 
}
//@TODO: add handler creation functions called by route setup
//routine for each individual web service.  Note that each
//returned handler should be wrapped using errorWrap() to
//ensure that any internal errors are handled reasonably.
function doGet(app){
	return errorWrap(async function(req, res) {
			try {
			const my_id = req.params.id;
			const my_res = await app.locals.finder.docContent(my_id);
			if (my_res.length === 0) {
			throw {
isDomain: true,
errorCode: NOT_FOUND,
message: `name ${my_id} not found`,
};
}
else {
res.json({'content':my_res,'links':[
		{'rel':'self','href':baseUrl(req,DOCS)+'/'+my_id}]} );
}
}
catch(err) {
const my_err = mapError(err);
res.status(my_err.status).json(my_err);
}
});

}
function doSearch(app){
	return errorWrap(async function(req, res){
			var ret = [];
			var counter = 0;
			try {
			const my_q = req.query.q;
			if(!my_q){
			throw {
			isDomain: true,
			errorCode: 'BAD_PARAM',
			message: `Parameter q is not found`,
			};
			}else{
			const temp = Number(req.query.count)||5;
			if(temp<0){
			throw {
			isDomain: true,
			errorCode: 'BAD_PARAM',
			message: `Parameter '/count/' not found`,
			};
			}else{
			const temp2 = Number(req.query.start)||0;
			if(temp2<0){
			throw {
			isDomain: true,
		  	errorCode: 'BAD_PARAM',
		  	message: `Parameter /'start/' not found`,
			};
			}else{
			const temp3 = await app.locals.finder.find(my_q);
	for(var i= temp2;i<temp3.length;i++){
		counter++;
		if(counter>temp){
			break;
		}
		var result = {'name': temp3[i].name,
			'score': temp3[i].score,
			'line': temp3[i].lines,
			'href': baseUrl(req,DOCS)+'/'+ temp3[i].name
		};
		ret.push(result);
	}
	let edit = my_q.replace(" ","%20");
	var url = req.protocol + '://' + req.get('host') +'/docs?q='+edit+'&start='+temp2+'&count='+temp;
	var my_links=[{
		'rel':'self',
			"href":url
	}];
	if((temp2+temp)< temp3.length){
		url = req.protocol + '://' + req.get('host') +'/docs?q='+edit+'&start='+(temp2+temp)+'&count='+temp;
		my_links.push({'href':'next', 'link':url});
	}
	if((temp2+temp)>=temp3.length){
		if((temp2-temp)>=0){
			url=req.protocol + '://' + req.get('host') +'/docs?q='+edit+'&start='+(temp2-temp)+'&count='+temp;
			my_links.push({'href':'prev', 'link':url});
		}

	}
	res.json({'results':ret,
			'totalCount': temp3.length,
			'links':my_links
			});
}
}
}
}
catch(err){
	const my_err = mapError(err);
	res.status(my_err.status).json(my_err);  
}
});
}

function doAdd(app){
	return errorWrap(async function(req, res){
			try {
			const my_val = req.body.name;
			if(!my_val){
			throw{
			isDomain: true,
			errorCode: 'BAD_REQUEST',
			message: 'required body parameter \"val\"is missing'
			};
			}else{
			const my_ret = req.body.content;
			if(!my_ret){
			throw{
			isDomain: true,
			errorCode: 'BAD_REQUEST',
			message: `required body parameter \"my_ret\"is missing`,
			};
			}else{
			await app.locals.finder.addContent(my_val,my_ret);
			res.append('Location', baseUrl(req, DOCS) + '/' + val);
			let url = baseUrl(req, DOCS) + '/' + val;
			res.status(CREATED).json({'href':url});
}
}

}catch(err){
	const my_err = mapError(err);
	res.status(my_err.status).json(my_err);
}
});
}

function complete(app){
	return errorWrap(async function(req, res){
			try{
			const text1 = req.query.text;
			if(!text1){
			throw{
			isDomain: true,
			errorCode: 'NOT_FOUND',
			message: `Missing text`,
			};
			}else {
			const cur = await app.locals.finder.complete(text1);
			if(cur.length ===0){
			throw{
			isDomain: true,
			errorCode: 'BAD_PARAM',
			message:` required query parameter \"text"\ not found`,
			};
			}else{
			res.json({'list':cur});
	}
	}
}
catch(err){
	const mapped = mapError(err);
	res.status(mapped.status).json(mapped);
}
});
}

/** Return error handler which ensures a server error results in nice
 *  JSON sent back to client with details logged on console.
 */ 
function doErrors(app) {
	return async function(err, req, res, next) {
		res.status(SERVER_ERROR);
		res.json({ code: 'SERVER_ERROR', message: err.message });
		console.error(err);
	};
}

/** Set up error handling for handler by wrapping it in a 
 *  try-catch with chaining to error handler on error.
 */
function errorWrap(handler) {
	return async (req, res, next) => {
		try {
			await handler(req, res, next);
		}
		catch (err) {
			next(err);
		}
	};
}

/** Return base URL of req for path.
 *  Useful for building links; Example call: baseUrl(req, DOCS)
 */
function baseUrl(req, path='/') {
	const port = req.app.locals.port;
	const url = `${req.protocol}://${req.hostname}:${port}${path}`;
	return url;
}


/*ERROR MAPPING*/
const ERROR_MAP = {
EXISTS: CONFLICT,
	NOT_FOUND: NOT_FOUND
}

/*maps domain error into HTTP errors*/
function PUTERROR(err){
	return err.isDomain ? {status: (ERROR_MAP[err.errorCode] || BAD_REQUEST),
		code: err.errorCode,
		message: err.message
	}
	: {status: SERVER_ERROR,
		code: 'INTERNAL',
		message: err.toString()
	};
}
