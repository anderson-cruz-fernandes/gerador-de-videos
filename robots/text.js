const algorithmia               = require("algorithmia")
const algorithmiaApiKey         = require('../credentials/algorithmia.json').apiKey
const sentenceBoundaryDetection = require('sbd')

const watsonApiKey = require('../credentials/watson-nlu.json').apikey

const NaturalLanguageUnderstandingV1 = require('ibm-watson/natural-language-understanding/v1')
const { IamAuthenticator } = require('ibm-watson/auth')

const naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
  version: '2019-07-12',
  authenticator: new IamAuthenticator({
    apikey: watsonApiKey,
  }),
  url: 'https://api.us-south.natural-language-understanding.watson.cloud.ibm.com/instances/17d8997c-702e-407b-bdce-e7c89fed5c46',
})

const state = require('./state.js')

async function robot() {
    const content = state.load()

    await fetchContentFromWikipedia(content)
    sanitizeContent(content)
    breakContentIntoSentences(content)
    limitMaximumSentences(content)
    await fetchKeywordsOfAllSentences(content)

    state.save(content)
}

async function fetchContentFromWikipedia(content) {
    const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey)
    const wikipediaAlgorithm       = algorithmiaAuthenticated.algo('web/WikipediaParser/0.1.2?timeout=300')
    const wikipediaResponse        = await wikipediaAlgorithm.pipe(content.searchTerm)    
    const wikipediaContent         = wikipediaResponse.get()
    
    content.sourceContentOriginal = wikipediaContent.content
}

function sanitizeContent(content) {
    const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(content.sourceContentOriginal) 
    const withoutDatesInParentheses    = removeDatesInParentheses(withoutBlankLinesAndMarkdown)
 
    content.sourceContentSanitized = withoutDatesInParentheses

    function removeBlankLinesAndMarkdown(text) {
        const allLines = text.split('\n')
        
        const withoutBlankLinesAndMarkdown = allLines.filter((line) => {
            if (line.trim().length === 0 || line.trim().startsWith('=')) {
                return false
            }
            return true
        })

        return withoutBlankLinesAndMarkdown.join(' ')
    }
}

function removeDatesInParentheses(text) {
    return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, '').replace(/  /g,' ')
}

function breakContentIntoSentences(content) {
    content.sentences = []

    const sentences = sentenceBoundaryDetection.sentences(content.sourceContentSanitized)    
    sentences.forEach((sentence) => {
        content.sentences.push({
            text: sentence,
            keywords: [],
            images: []
        })
    })
}

function limitMaximumSentences(content) {
    content.sentences = content.sentences.slice(0, content.maximumSentences)
}

async function fetchKeywordsOfAllSentences(content) {
    for (const sentence of content.sentences) {
        sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)
    }
}

async function fetchWatsonAndReturnKeywords(sentence) {
    return new Promise((resolve, reject) => {
        naturalLanguageUnderstanding.analyze({
            text: sentence,
            features: {
                keywords: {}
            }
        }, (error, response) => {
            if (error) {
                throw error
            }
            
            const keywords = response.result.keywords.map((keyword) => { 
                return keyword.text
            })

        resolve(keywords)
    })
})
}
module.exports = robot  