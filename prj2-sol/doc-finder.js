const assert = require('assert');
const mongo = require('mongodb').MongoClient;

const {inspect} = require('util'); //for debugging

'use strict';

/** This class is expected to persist its state.  Hence when the
 *  class is created with a specific database url, it is expected
 *  to retain the state it had when it was last used with that URL.
 */
class DocFinder {

    /** Constructor for instance of DocFinder. The dbUrl is
     *  expected to be of the form mongodb://SERVER:PORT/DB
     *  where SERVER/PORT specifies the server and port on
     *  which the mongo database server is running and DB is
     *  name of the database within that database server which
     *  hosts the persistent content provided by this class.
     */
    constructor(dbUrl) {   	
	this.url = dbUrl.substring(0,26);
        const regex = /(mongodb:\/\/\w*(\:\d{1,5})?\/(\w*))/;	
	this.db_name = dbUrl.match(regex)[3];
    }

    /** This routine is used for all asynchronous initialization
     *  for instance of DocFinder.  It must be called by a client
     *  immediately after creating a new instance of this.
     */
    async init() {
        this.myclient = await mongo.connect(this.url, MONGO_OPTIONS);
        this.database = this.myclient.db(this.db_name);
	this.wordsset = new Set();
	this.maoOfWords = new Map();
        await this.database.createCollection(NOISE_TABLE);
        this.mywords_table = this.database.collection(WORDS_TABLE);
        this.mynoise_table = this.database.collection(NOISE_TABLE);
        this.mycompletions = this.database.collection(COMPLETIONS_TABLE);
        this.mytable = this.database.collection(CONTENTS_TABLE);
        this.noise_words = new Set();
	const flag = await this.mynoise_table.find({});
        this.noise_words = (await flag.toArray()).map(x => x._id);
    }  /** Return an array of non-noise normalized words from string
   *  contentText.  Non-noise means it is not a word in the noiseWords
   *  which have been added to this object.  Normalized means that
   *  words are lower-cased, have been stemmed and all non-alphabetic
   *  characters matching regex [^a-z] have been removed.
   */
/*TAKEN FROM PROFESSORS PROJECT 1*/
  async words(contentText) {
    return (await this._wordsLow(contentText)).map((pair) => pair[0]);
  }
async _wordsLow(content) {
    const words = [];
    let match;
    while (match = WORD_REGEX.exec(content)) {
      const word = normalize(match[0]);
      if (word && !this.noise_words.includes(word)) {
	words.push([word, match.index]);
      }
    }
    return words;
  }
/** Release all resources held by this doc-finder.  Specifically,
   *  close any database connections.
   */
async close() {
    await this.myclient.close();
  }

  /** Clear database */
  async clear() {
    await this.mytable.deleteMany({});
    await this.mycompletions.deleteMany({});
    await this.mywords_table.deleteMany({});
    await this.mynoise_table.deleteMany({});
 }  
   
/** Add all normalized words in the noiseText string to this as
   *  noise words.  This operation should be idempotent.
   */
  async addNoiseWords(noiseText) {
    const n = new Set(await this.words(noiseText));
    this.noise_words.forEach(x => n.delete(x));
    if (n.size != 0) {
      await this.mynoise_table.insertMany(Array.from(n).map(i=>({_id:i})));
    }
  }

async addContent(name, contentText)
{
    //TODO
	if(!contentText.match("\n")){
		contentText.append("\n"); //checking
		contentText = contentText + "\n";
	}
	await this.mytable.replaceOne({_id:name}, {_id:name, contents:contentText},{upsert:true});
	let unique_array = await this._wordsLow(contentText);
	const idxarry = {};
	const element = [];
	for (let i = 0; i < unique_array.length; i++){
		const [w, fileOffset] = unique_array[i];
		this.wordsset.add(unique_array[i]);
		const meta = idxarry[w] || [0, fileOffset];
		meta[0]++;
		idxarry[w] = meta;
	}
	for(const [alpha, meta] of Object.entries(idxarry)){
		await this.mywords_table.updateOne({_id:alpha}, {$set:{[name]:meta}}, {upsert:true});
	}
	const idx = Object.keys(idxarry);
	const elemtns = [];
	for(let i = 0; i < idx.length; i++){
		if(!this.maoOfWords.get(elemtns[0])){
			const a = elemtns[0];
			this.maoOfWords.set(a,[]);
			this.maoOfWords.get(a).push(elemtns);
		}
	}
	for(const key of this.maoOfWords.keys()){
		const document = await this.mycompletions.findOne({_id:key});
		const data = [];
		const getdoc = this.maoOfWords.get(key);
		if(document){
			const wholedoc = getdoc.concat(document);
			const docset = new Set(wholedoc);
			const data = Array.from(docset);
			await this.mycompletions.replaceOne({_id:key}, {_id:key,words:data}, {upsert:true});
		}else{
			const wholedoc = getdoc.concat([]);
			const docset = new Set(wholedoc);
			const data = Array.from(docset);
			await this.mycompletions.replaceOne({_id:key}, {_id:key,words:data},{upsert:true});
		}
	}
}
  /** Return contents of document name.  If not found, throw an Error
   *  object with property code set to 'NOT_FOUND' and property
   *  message set to `doc ${name} not found`.
   */
  async docContent(name) {
    const docum = await this.mytable.findOne({_id: name});
    if (docum) {return docum.contents;}
    else {const error = new Error(`docum ${name} not found`);
      error.code = 'NOT_FOUND';
      throw error;
    }
  }

  /** Given a list of normalized, non-noise words search terms,
   *  return a list of Result's  which specify the matching documents.
   *  Each Result object contains the following properties:
   *
   *     name:  the name of the document.
   *     score: the total number of occurrences of the search terms in the
   *            document.
   *     lines: A string consisting the lines containing the earliest
   *            occurrence of the search terms within the document.  The
   *            lines must have the same relative order as in the source
   *            document.  Note that if a line contains multiple search
   *            terms, then it will occur only once in lines.
   *
   *  The returned Result list must be sorted in non-ascending order
   *  by score.  Results which have the same score are sorted by the
   *  document name in lexicographical ascending order.
   *
   */

/*** ALTERED proffesors code  FROM PROJECT 1*/
  async find(terms) {
	const d = new Map();
	for(let i = 0; i < terms.length; i++){
	const temp = await this.mywords_table.findOne({_id:terms[i]});
	if(temp){
		for(const [x, y] of Object.entries(temp)){
			if(x === '_id'){
			continue;
			}
			let idx = d.get(x);
			if(!idx){
				d.set(x, idx = []);
				idx.push(y);
			}
			}
		}	
	};
    	const results = [];
    	for (const [name, wordInfos] of d.entries()) {
      	const my_content = await this.docContent(name);
      	const val  = wordInfos.reduce((acc, wordInfo) => acc + wordInfo[0], 0);
      	const off = wordInfos.map(wordInfo => wordInfo[1]);
      	results.push(new OffsetResult(name, val, off).result(my_content));
    }
    results.sort(compareResults);
    return results;
  }
/*
  /** Given a text string, return a ordered list of all completions of
   *  the last normalized word in text.  Returns [] if the last char
   *  in text is not alphabetic.
   */

/*Altered professors project 1 code solutions*/
  async complete(text) {
    if (!text.match(/[a-zA-Z]$/)) return [];
 }



} //class DocFinder

module.exports = DocFinder;

//Collection names
const CONTENTS_TABLE = 'contents';
const COMPLETIONS_TABLE = 'completions';
const WORDS_TABLE = 'words';
const NOISE_TABLE = 'noise';


//Used to prevent warning messages from mongodb.
const MONGO_OPTIONS = {
  useNewUrlParser: true
};

/** Regex used for extracting words as maximal non-space sequences. */
const WORD_REGEX = /\S+/g;

/** A simple utility class which packages together the result for a
 *  document search as documented above in DocFinder.find().
 */
class Result {
  constructor(name, score, lines) {
    this.name = name; this.score = score; this.lines = lines;
  }

  toString() { return `${this.name}: ${this.score}\n${this.lines}`; }
}

/** Compare result1 with result2: higher scores compare lower; if
 *  scores are equal, then lexicographically earlier names compare
 *  lower.
 */
function compareResults(result1, result2) {
  return (result2.score - result1.score) ||
    result1.name.localeCompare(result2.name);
}

/** Normalize word by stem'ing it, removing all non-alphabetic
 *  characters and converting to lowercase.
 */
function normalize(word) {
  return stem(word.toLowerCase()).replace(/[^a-z]/g, '');
}

/** Place-holder for stemming a word before normalization; this
 *  implementation merely removes 's suffixes.
 */
function stem(word) {
  return word.replace(/\'s$/, '');
}

/** Like Result, except that instead of lines it contains a list of
 *  offsets at which the search terms occur within the document.
 */
class OffsetResult {
  constructor(name, score, offsets) {
    this.name = name; this.score = score; this.offsets = offsets;
  }

  /** Convert this to a Result by using this.offsets to extract
   *  lines from contents.
   */
  result(contents) {
    const starts = new Set();
    this.offsets.forEach(o => starts.add(contents.lastIndexOf('\n', o) + 1));
    let lines = '';
    for (const i of Array.from(starts).sort((a, b) => a-b)) {
      lines += contents.substring(i, contents.indexOf('\n', i) + 1);
    }
    return new Result(this.name, this.score, lines);
  }
}










  
