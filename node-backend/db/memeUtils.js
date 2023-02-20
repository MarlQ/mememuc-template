"use strict";

const archiver = require('archiver');
const axios = require('axios');
const {Meme} = require('./models');

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

    query.limit = +query.limit;
    query.skip = +query.skip;

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
            case 'all':
                // TODO: Debug function
                documents = await Meme.find({
                    $or: [
                        { visibility: 'public' },
                        { visibility: { $in: ['private', 'unlisted'] }, creator: req.username }
                      ]
                }, MEME_EXCLUDE_PROPERTIES);
                break;
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
    documents = documents.map(doc => Meme.hydrate(doc)); // Aggregate removes the url virtual property, so we have to do this
    documents = await Promise.all(documents.map(async doc =>  ({...doc.toObject(), likes: await doc.getLikesCount(), comments: await doc.getCommentsCount()}) ) ); 
    return documents;
}

async function handleMemesResponse(res, documents, format) {
    // Return the found memes
    switch(format) {
        case 'json':
            res.json(documents);
            return;
        case 'zip':
            // Send ZIP
            if(!Array.isArray(documents)) documents = [documents]; 
            const metaData = JSON.stringify({ image: undefined, ...documents }, null, 2);
            const archive = archiver('zip', { zlib: { level: 9 } });
            res.attachment('memes.zip');
            archive.pipe(res);
            for(let i = 0; i < documents.length; i++) {
                try {
                    const response = await axios.get(documents[i].url, {responseType: 'arraybuffer'});
                    //const imageBase64 =  `data:${response.headers['content-type']};base64,${Buffer.from(response.data, 'binary').toString('base64')}`;
                    const imgData = Buffer.from(response.data, 'binary');
                    const paddedIndex = (i + 1).toString().padStart(documents.length.toString().length, '0'); // TODO: Fix the names (only rename when they clash)
                    const extension = documents[i].contentType.split('/')[1];
                    const name = `meme_${documents[i].name}_${paddedIndex}.${extension}`;
                    archive.append(imgData, { name });
                }
                catch (error){
                    console.log(error);
                    return res.status(500).send();
                }
            }
            archive.append(metaData, {name: "meta-data.json"});
            archive.finalize();
            
            return;
        case 'image':
            // Url to the image itself
            if(Array.isArray(documents)) res.json({ urls: documents.map(m => `http://${process.env.BE_DOMAIN}/resources/images/${m.publicId}`) });
            else { // Returns an actual image if called for a singular meme
                const response = await axios.get(`http://${process.env.BE_DOMAIN}/resources/images/${documents.publicId}`, {responseType: 'arraybuffer'});
                const imageBuffer = new Buffer.from(response.data, 'binary');
                res.set('Content-Type', response.headers['content-type']);
                res.send(imageBuffer);
            }
            return;
        case 'single-view':
            if(Array.isArray(documents)) res.json({ urls: documents.map(m => `http://${process.env.FE_DOMAIN}/memes/${m.publicId}`) });
            else res.send(`http://${process.env.FE_DOMAIN}/memes/${documents.publicId}`);
            return;
        default:
            res.status(400).send('Invalid response format requested');
    }
}

module.exports = {
    handleMemeFind,
    handleMemesResponse
}