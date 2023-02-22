"use strict";

const archiver = require('archiver');
const axios = require('axios');
const {Meme, User} = require('./models');
const {renameDuplicates} = require('../utils/utils');

const MEME_EXCLUDE_PROPERTIES = { image: 0, _id: 0, __v: 0 };
async function handleMemeFind(req) {
    const query_default = {
        sort: 'random',
        id: undefined,
        limit: 10,
        creator: undefined,
        skip: 0
    };
    const query = Object.assign({}, query_default, req.query);

    query.limit = Math.min(100, Math.max(1, +query.limit));
    query.skip = Math.max(1, +query.skip);

    // The found memes
    let documents;

    if(query.id) {
        // ID was given. The meme with the id is return inside an array.
        const publicId  = query.id;
        documents = await Meme.find({ publicId }, MEME_EXCLUDE_PROPERTIES).catch((e) => res.status(500).send());
        if(!documents) {
            return 404; // res.status(404).send({ error: "Meme not found" });
        }
        for(const doc of documents) {
            if (((doc.visibility === 'private') && req.username !== doc.creator) ) {
                return 401; // res.status(401).send();
            }
        }
        
    }
    else {
        // Search for the memes, according to the config options
        switch(query.sort){
            /* case 'all':
                // TODO: Debug function
                documents = await Meme.find({
                    $or: [
                        { visibility: 'public' },
                        { visibility: { $in: ['private', 'unlisted'] }, creator: req.username }
                      ]
                }, MEME_EXCLUDE_PROPERTIES);
                break; */
            case 'random': {

                const pipeline = [
                    {
                        $match: {
                            $or: [
                                { visibility: 'public' },
                                { visibility: { $in: ['private', 'unlisted'] }, creator: req.username }
                            ]
                        }
                    },
                    {
                        $sample: { size: query.limit }
                    },
                    {
                        $project: MEME_EXCLUDE_PROPERTIES
                    }
                ];

                // Restrict to creator parameter
                if(query.creator) pipeline.unshift({$match: { creator: query.creator }});

                documents = await Meme.aggregate(pipeline);
                break;
            }   
            case 'newest': // Same as oldest but with different sortOrder
            case 'oldest': {
                const sortOrder = query.sort === 'newest' ? -1 : 1;
                const pipeline = [
                    {
                        $match: {
                            $or: [
                                { visibility: 'public' },
                                { visibility: { $in: ['private', 'unlisted'] }, creator: req.username }
                            ]
                        }
                    },
                    {
                        $sort: { createdAt: sortOrder }
                    },
                    {
                        $skip: query.skip
                    },
                    {
                        $limit: query.limit
                    },
                    {
                        $project: MEME_EXCLUDE_PROPERTIES
                    }
                ];

                // Restrict to creator parameter
                if(query.creator) pipeline.unshift({$match: { creator: query.creator }})

                documents = await Meme.aggregate(pipeline);
                //documents = documents.map(doc => Meme.hydrate(doc)); 
                break;
            }
            default:
                return 400;
        }
    }
    
    // Document was no found
    if(!documents) {
        //res.status(404).send();
        return 404;
    }
    documents = documents.map(doc => Meme.hydrate(doc));
    
    return documents;
}

async function handleMemesResponse(res, documents, format) {

    // Return the found memes
    if(!Array.isArray(documents)) documents = {...documents.toObject(), image: undefined, _id: undefined, __v: undefined, imageUrl: await documents.getImageUrl(), singleViewUrl: await documents.getSingleViewUrl(), likes: await documents.getLikesCount(), comments: await documents.getCommentsCount(), views: await documents.getViewCount()};
    else documents = await Promise.all(documents.map(async doc =>  ({...doc.toObject(), image: undefined, _id: undefined, __v: undefined, imageUrl: await doc.getImageUrl(), singleViewUrl: await doc.getSingleViewUrl(), likes: await doc.getLikesCount(), comments: await doc.getCommentsCount(), views: await doc.getViewCount()}) ) ); 
    switch(format) {
        case 'json':
            res.json(documents);
            return;
        case 'download':
        case 'zip':
            // Send ZIP
            if(!Array.isArray(documents)) documents = [documents]; 
            const metaData = JSON.stringify({ image: undefined, ...documents }, null, 2);
            const archive = archiver('zip', { zlib: { level: 9 } });
            res.attachment('memes.zip');
            archive.pipe(res);
            const names = renameDuplicates(documents.map(d => d.name));
            for(let i = 0; i < documents.length; i++) {
                try {
                    const response = await axios.get(documents[i].imageUrl, {responseType: 'arraybuffer'});
                    //const imageBase64 =  `data:${response.headers['content-type']};base64,${Buffer.from(response.data, 'binary').toString('base64')}`;
                    const imgData = Buffer.from(response.data, 'binary');
                    const extension = documents[i].contentType.split('/')[1];
                    const name = `${names[i]}.${extension}`;
                    archive.append(imgData, { name });
                }
                catch (error){
                    console.error(error);
                    return res.status(500).send();
                }
            }
            archive.append(metaData, {name: "meta-data.json"});
            archive.finalize();
            
            return;
        case 'image':
            // Url to the image itself
            if(Array.isArray(documents)) res.json({ urls: documents.map(m => m.imageUrl) });
            else { // Returns an actual image if called for a singular meme
                const response = await axios.get(documents.imageUrl, {responseType: 'arraybuffer'});
                const imageBuffer = new Buffer.from(response.data, 'binary');
                res.set('Content-Type', response.headers['content-type']);
                res.send(imageBuffer);
            }
            return;
        case 'single-view':
            if(Array.isArray(documents)) res.json({ urls: documents.map(m => m.singleViewUrl) });
            else res.send(documents.singleViewUrl);
            return;
        default:
            res.status(400).send('Invalid response format requested');
    }
}
const USER_EXCLUDE_PROPERTIES = { password: 0, _id: 0, __v: 0 };
async function handleGetMemeRequest(req={}, res={}, contentType='json') {
    const username = req.params?.username ? req.params.username : req.username;
    if(!username) return res.status(400).send("Username not specified");

    if(!req.params?.username && req.username) {
        let user;
        try {
            user = await User.findOne({ username }, USER_EXCLUDE_PROPERTIES);
        }
        catch(error) {
            console.error(error);
            return res.status(500).send();
        }
        if(!user) {
            return res.status(404).send("User not found");
        }
    }
    
    req.query = {
        sort: req.query.sort,
        id: req.query.id,
        limit: req.query.limit,
        creator: username,
        skip: req.query.skip
    };

    const documents = await handleMemeFind(req);
    if(typeof(documents) === 'number') { // error code returned
        return res.status(documents).send();
    }
    handleMemesResponse(res, documents, contentType);
}

module.exports = {
    handleMemeFind,
    handleMemesResponse,
    handleGetMemeRequest
}