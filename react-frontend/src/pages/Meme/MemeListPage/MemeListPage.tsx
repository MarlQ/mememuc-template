import {useNavigate} from "react-router-dom";
import {Button, Card, Spin, Typography} from "antd";
import {CommentOutlined} from "@ant-design/icons";
import {DislikeButton, DownloadButton, LikeButton, ShareButton} from "src/components";
import {useFilterState, useMemesState, useSearchState, useSortState} from "src/states";
import {abbreviateNumber, getTimeSince} from "src/utils";
import InfiniteScroll from "react-infinite-scroll-component";
import {api} from "src/api";
import {useState} from "react";
import {useMeme} from "src/hooks";


const {Text} = Typography;

const MemeItem = ({id}: { id: string }) => {
    const navigate = useNavigate();

    const {meme} = useMeme(id);

    // Nav events
    const navigateToMeme = () => meme && navigate(meme.publicId);

    if (!meme) return null;

    // Conversion
    const totalComments = abbreviateNumber(meme.comments)
    const createdAt = getTimeSince(new Date(meme.createdAt));


    return (
        <Card
            style={{marginBottom: 50, marginInline: 'auto', borderRadius: 15, width: 500}}
            cover={<img src={meme.imageUrl} onClick={navigateToMeme} alt={meme.name}/>}
            hoverable
            actions={[
                <LikeButton id={meme.publicId}/>,
                <DislikeButton id={meme.publicId}/>,
                <Button type={'ghost'} onClick={navigateToMeme}>
                    <CommentOutlined key={'comment'}/>
                    <Text>{totalComments}</Text>
                </Button>,
                <DownloadButton meme={meme}/>,
                <ShareButton meme={meme}/>
            ]}
        >
            <div onClick={navigateToMeme}>
                <Card.Meta
                    title={meme.name}
                    description={
                        <div style={{display: 'flex', justifyContent: 'space-between'}}>
                            <span>by {
                                meme?.creatorDisplayName
                                    ? meme.creatorDisplayName
                                    : 'Unknown'
                            }
                            </span>
                            <span>{createdAt}</span>
                        </div>
                    }
                />
            </div>
        </Card>
    );
}

export const MemeListPage = () => {
    const [memes, setMemes] = useMemesState();
    const [hasMore, setHasMore] = useState(true);
    const [sort,] = useSortState();
    const [search,] = useSearchState();
    const [filter,] = useFilterState();

    const handleNext = async () => {
        const newMemes = await api.memes.list(memes.length, 10, sort, filter, search);
        if (newMemes.length === 0) {
            setHasMore(false);
        }
        const currentMemeIds = memes.map(m => m.publicId);
        setMemes(prev => [...prev, ...newMemes.filter(meme => !currentMemeIds.includes(meme.publicId))]);
        return memes
    }

    return (
        <InfiniteScroll
            dataLength={memes.length} //This is important field to render the next data
            next={handleNext}
            hasMore={hasMore}
            loader={<Spin/>}
            endMessage={
                <p style={{textAlign: 'center'}}>
                    <b>Yay! You have seen it all</b>
                </p>
            }
        >
            {memes.map(item => <MemeItem key={item.publicId} id={item.publicId}/>)}
        </InfiniteScroll>
    )
}