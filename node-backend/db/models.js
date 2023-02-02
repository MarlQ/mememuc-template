const mongoose = require('mongoose');


const url = `http://localhost:3001/resources/images/`; // FIXME:

const User = mongoose.model('User', new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        displayName: { type: String, required: true },
        password: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    },
    {
        methods: {
            async getLikesCount() {
                return await Like.countDocuments({ username: this.username });
            },
            async getCommentsCount() {
                return await Comment.countDocuments({ username: this.username });
            },
            async getMemesCount() {
                return await Meme.countDocuments({ creator: this.username });
            }
        }
    })
);


const Meme = mongoose.model('Meme', new mongoose.Schema({
        name: { type: String, required: true },
        creator: { type: String, required: true },
        visibility: { type: String, enum: ['private', 'unlisted', 'public'], default: 'public' },
        image: { type: Buffer, required: true },
        publicId: { type: String, required: true, unique: true },
        contentType: { type: String, default: 'image/png' }, // TODO: Make enum
        createdAt: { type: Date, default: Date.now },
        //likes: {type: Number, default: 0 }
    }, 
    {
        id: false,
        toObject: { virtuals: true },
        toJSON: { virtuals: true }
    })
);

Meme.schema.virtual('url').get(function() {
    return `${url}${this.publicId}`;
});

const getLikes = async function(memePublicId) {
    const likes = await Like.countDocuments({ memePublicId });
    return likes;
}

const getNumComments = async function(memePublicId) {
    const count = await Comment.countDocuments({ memePublicId });
    return count;
}

const Template = mongoose.model('Template', new mongoose.Schema({
        name: { type: String, required: true, unique: true  },
        creator: { type: String },
        visibility: { type: String, enum: ['private', 'unlisted', 'public'], default: 'public' },
        image: { type: Buffer, required: true },
        publicId: { type: String, required: true, unique: true },
        contentType: { type: String, default: 'image/png' }, // TODO: Make enum
        createdAt: { type: Date, default: Date.now },
        texts: { type: Array }
    }, 
    {
        id: false,
        toObject: { virtuals: true },
        toJSON: { virtuals: true }
    })
);

Template.schema.virtual('url').get(function() {
    return `${url}${this.publicId}`;
});

const Comment = mongoose.model('Comment', new mongoose.Schema({
    content: { type: String, required: true },
    username: { type: String, required: true },
    memePublicId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    publicId: { type: String, required: true, unique: true },
    })
);

const Like = mongoose.model('Like', new mongoose.Schema({
    username: { type: String, required: true },
    memePublicId: { type: String, required: true } // Uses the publicId, because that requires less operations in this case
    })
);

const uniqueId = () => {
    return Date.now() + '' + Math.floor(Math.random() * 100000);
}

const generatePublicId = async (model, identifier="", publicIdSet) => {

    let publicId = identifier + uniqueId();
    let document = await model.findOne({ publicId });
    
    while(document || (publicIdSet ? publicIdSet.has(publicId) : false)) { // Ensure that the publicId is unique
        publicId = uniqueId();
        document = await model.findOne({ publicId });
    }
    if(publicIdSet) publicIdSet.add(publicId);
    return publicId;
}

const MEME_EXCLUDE_PROPERTIES = { image: 0, _id: 0, __v: 0 };

const handleGetMemeRequest = async (req, res, next) => {
    const config_default = {
        sort: 'random',
        id: undefined,
        limit: 10,
        creator: undefined,
        skip: 0,
        return: 'json' // single-view, image-url, download, json
    };
    const config = Object.assign({}, config_default, req.query);
    config.limit = +config.limit;
    config.skip = +config.skip;

    // The found memes
    let documents;

    if(config.id) {
        // ID was given. The meme with the id is return inside an array.
        const publicId  = config.id;
        documents = await Meme.find({ publicId }, MEME_EXCLUDE_PROPERTIES).catch((e) => res.status(500).send());
        if(!documents) {
            return res.status(404).send({ error: "Meme not found" });
        }
        for(const doc of documents) {
            if (((doc.visibility === 'private') && req.username !== doc.creator) ) {
                return res.status(401).send();
            }
        }
        
    }
    else {
        // Search for the memes, according to the config options
        switch(config.sort){
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
                        $sample: { size: config.limit }
                    },
                    {
                        $project: MEME_EXCLUDE_PROPERTIES
                    }
                ];

                // Restrict to creator parameter
                if(config.creator) pipeline.push({$match: { creator: config.creator }});

                documents = await Meme.aggregate(pipeline);
                break;
            }   
            case 'newest': // Same as oldest but with different sortOrder
            case 'oldest': {
                const sortOrder = config.sort === 'newest' ? -1 : 1;
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
                        $limit: config.limit
                    },
                    {
                        $skip: config.skip
                    },
                    {
                        $project: MEME_EXCLUDE_PROPERTIES
                    }
                ];

                // Restrict to creator parameter
                if(config.creator) pipeline.push({$match: { creator: config.creator }})

                documents = await Meme.aggregate(pipeline);
                //documents = documents.map(doc => Meme.hydrate(doc)); 
                break;
            }
            default:
                res.status(400).send();
                return;
        }
    }
    
    // Document was no found
    if(!documents) {
        res.status(404).send();
        return;
    }
    documents = documents.map(doc => Meme.hydrate(doc)); // Aggregate removes the url virtual property, so we have to do this
    documents = await Promise.all(documents.map(async doc =>  ({...doc.toObject(), likes: await getLikes(doc.publicId), comments: await getNumComments(doc.publicId)}) ) ); // Append the likes (this was surprisingly hard to to)

    console.log("DOCS", documents)
    // Return the found memes
    switch(config.return) {
        case 'json':
            res.json(documents);
            return;
        case 'download':
            if(documents.length === 1) {
                // Return a single image
                // TODO: Add metadata
                res.set('Content-Type', 'image/png');
                res.send(documents[0].image);
            }
            else {
                // Send ZIP
                // TODO: Add metadata
                const archive = archiver('zip', { zlib: { level: 9 } });
                res.attachment('memes.zip');
                archive.pipe(res);
                for(let i = 0; i < documents.length; i++) {
                    // Create nice, 0-padded names
                    const paddedIndex = (i + 1).toString().padStart(documents.length.toString().length, '0');
                    const extension = documents[i].contentType.split('/')[1];
                    const name = `meme_${documents[i].name}_${paddedIndex}.${extension}`;
                    archive.append(documents[i].image, { name });
                }
                archive.finalize();
            }
            return;
        case 'image-url':
            // Url to the image itself
            res.status(201).json({ urls: documents.map(m => `${req.protocol}://${req.get('host')}/resources/images/${m.publicId}`) });
            return;
        case 'single-view':
            // TODO: Implement
            // TODO: Retrieve port and address
            console.log("PORT", process.env.PORT);
            res.status(201).json({ urls: documents.map(m => `${req.protocol}://${req.get('host')}/resources/images/${m.publicId}`) });
            return;
    }
}

module.exports = {
    User,
    Meme,
    Template,
    Like,
    Comment,
    generatePublicId,
    getLikes,
    getNumComments,
    handleGetMemeRequest
}