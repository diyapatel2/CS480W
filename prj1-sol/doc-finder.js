const {inspect} = require('util'); //for debugging

'use strict';
const fs = require('fs');
class DocFinder {

	/** Constructor for instance of DocFinder. */
	constructor() {

		//@TODO
		this.set1 = new Set();  //contains noiseWords
		this.structure = new Map(); //Contains offical structure Map[Map]
		this.set2 = new Set();
	}

	/** Return array of non-noise normalized words from string content.
	 *  Non-noise means it is not a word in the noiseWords which have
	 *  been added to this object.  Normalized means that words are
	 *  lower-cased, have been stemmed and all non-alphabetic characters
	 *  matching regex [^a-z] have been removed.
	 */
	words(content) {
		//@TODO

		return this._wordsLow(content);
	}
	_wordsLow(content){

		var split_content = content.split(/\s+/);
		var w = split_content.map((word) => normalize(word));

		w.map((w) => stem(w));
		w.filter((w) => !(this.is_noise_word(w)));
		return w;

	}
	/*Reads noise-words.txt file and goes through the lines to match the word.
	 * If match returns true, else returns false*/
	is_noise_word(w){
		if(this.set1.has(w)){
			return true;
		}
		return false;
	}
	/** Add all normalized words in noiseWords string to this as
	 *  noise words.
	 */
	addNoiseWords(noiseWords) {
		//@TODO
		this.words(noiseWords).forEach((w) => {
				this.set1.add(w);
				});

		return this.set1;
	}

	/** Add document named by string name with specified content to this
	 *  instance. Update index in this with all non-noise normalized
	 *  words in content string.
	 */
	addContent(name, content) {
		//@TODO
		//aad each of the non-noise normalized words in the document content to your indexing structure
		//split the content based on \n ->
		var lines = content.match(/[^\r\n]+/g);
		for(var i=0; i < lines.length;i++){
			//console.log(lines[i]);
			this.words(lines[i]).forEach((w) => {
					//console.log("   ", w, "    ");
					var temp = normalize(w);
					if(!(this.is_noise_word(temp))){
					this.set2.add(temp);
					if(!(this.structure.has(temp)))//if the structure does not contain the word
					{
					//console.log(temp, " " ,name);
					var doc_record = new Map();
					doc_record.set(name,{count : 1, first_line : lines[i],idx:i});
					this.structure.set(temp,doc_record);
					if(!(this.structure.get(temp).has(name))){
					var doc_record = this.structure.get(temp);
					doc_record.set(name,{count : 1, first_line : lines[i], idx:i});
					this.structure.set(temp,doc_record);
					}
					}else if(!(this.structure.get(temp).has(name))){
					//console.log(name,"  ", temp)
					var doc_record = this.structure.get(temp);
					//console.log(this.structure.get(temp));
					doc_record.set(name,{count : 1, first_line : lines[i],idx:i});
					}
					else{
						let get_doc_record = this.structure.get(temp).get(name);
						get_doc_record["count"]+=1;
					}
					}
			});
		}
	}

	/** Given a list of normalized, non-noise words search terms,
	 *  return a list of Result's  which specify the matching documents.
	 *  Each Result object contains the following properties:
	 *     name:  the name of the document.
	 *     score: the total number of occurrences of the search terms in the
	 *            document.
	 *     lines: A string consisting the lines containing the earliest
	 *            occurrence of the search terms within the document.  Note
	 *            that if a line contains multiple search terms, then it will
	 *            occur only once in lines.
	 *  The Result's list must be sorted in non-ascending order by score.
	 *  Results which have the same score are sorted by the document name
	 *  in lexicographical ascending order.
	 *
	 */
	find(terms) {
		//@TODO

		var lines = 0;
		var result_list = [];
		var documents= new Map();
		var index = 0;
		for(var i = 0; i < terms.length; i+=1){
			var doc_results = this.structure.get(terms[i]); // Returning Map
			if(!doc_results){

			} else {

				var iterator = doc_results.keys();
				for  (const [key, value] of doc_results.entries()) {

					if(documents.has(key)){
						var name=key;
						var scores =documents.get(name).result.score + doc_results.get(key).count ;
						if(documents.get(name).result.lines.localeCompare(doc_results.get(key).first_line)!=0){
							if(doc_results.get(key).idx > documents.get(name).line_idx) {
								var lines = documents.get(name).result.lines + doc_results.get(key).first_line;
							}else{
								var lines =  doc_results.get(key).first_line+documents.get(name).result.lines ;
							}
						}else{
							var lines = doc_results.get(key).first_line;
						}
						var result_obj = new Result(name, scores, lines);
						result_list[documents.get(name).idx] = result_obj;
					}else {
						var name = key; // Extract KEY from doc_results
						var score = doc_results.get(key).count;
						var lines = doc_results.get(key).first_line;

						var result_obj = new Result(name, score, lines);
						documents.set(name, {result: result_obj, idx: index,line_idx:doc_results.get(key).idx});

						result_list[index] = result_obj;
						index = index + 1;

					}
				}


			}

		}

		return result_list.sort(compareResults);

	}

	/** Given a text string, return a ordered list of all completions of
	 *  the last word in text.  Returns [] if the last char in text is
	 *  not alphabetic.
	 */
	complete(text) {
		//double tab will complete the text
		//@TODO
		return [];
	}



} //class DocFinder

module.exports = DocFinder;

/** Regex used for extracting words as maximal non-space sequences. */
const WORD_REGEX = /\S+/g;

/** A simple class which packages together the result for a
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



