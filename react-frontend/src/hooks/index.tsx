import {useEffect, useRef, useState} from "react";
import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import {useAsync, useUnmount} from "react-use";
import {useEditorState, useMemesState, useStageRef} from "src/states";
import {Card, Col, Input, InputNumber, Modal, Radio, Row, Select, Space} from "antd";
import {
    AppstoreOutlined,
    CameraOutlined,
    DownloadOutlined,
    FormOutlined,
    LinkOutlined,
    PictureOutlined
} from "@ant-design/icons";
import {downloadURI, isImgUrl} from "src/utils";
import Webcam from "react-webcam";
import {useTemplates} from "src/hooks/state-hooks";
import {MemeType} from "src/types";

export * from './state-hooks';

export const useAutoplay = () => {
    const [timer, setTimer] = useState<number>(0);
    const {memeId} = useParams();
    const [memes,] = useMemesState();
    const [autoplay, setAutoplay] = useState<number | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const startAutoplay = () => {
        searchParams.set('autoplay', '5');
        setSearchParams(searchParams);
    }
    const stopAutoplay = () => {
        setAutoplay(null);

        searchParams.delete('autoplay');
        setSearchParams(searchParams);
        clearTimeout(timer);
    }

    useEffect(() => {
        const autoplayParam = searchParams.get('autoplay');
        const autoplay = autoplayParam && !isNaN(parseInt(autoplayParam)) ? parseInt(autoplayParam) : null;
        setAutoplay(autoplay);

        if (autoplay) {
            // Cycle through list of memes with modulo
            const timer: any = setTimeout(() => {
                const index = memes.findIndex(meme => meme.id === memeId);
                const nextMeme = memes[(index + 1) % memes.length];
                navigate(`/memes/${nextMeme.id}?${searchParams}`);
            }, autoplay * 1000);
            setTimer(timer);
        }
    }, [searchParams, memeId, memes, navigate]);

    useUnmount(() => clearTimeout(timer));

    return {
        autoplay,
        startAutoplay,
        stopAutoplay
    };
}

export const useImgflipInputModal = () => {
    const memesLoadable = useAsync(() => fetch('https://api.imgflip.com/get_memes').then(res => res.json()));

    return () => new Promise<string | undefined>(resolve =>
        Modal.info({
            width: 1000,
            closable: true,
            icon: <AppstoreOutlined/>,
            title: 'Enter Imgflip URL',
            content: <Row gutter={[16, 16]}>
                {
                    memesLoadable.value && memesLoadable.value.data.memes.map((i: any) => (
                        <Col span={8} key={i.id}>
                            <Card title={i.name} hoverable onClick={() => {
                                resolve(i.url);
                                Modal.destroyAll()
                            }}>
                                <img src={i.url} style={{maxHeight: '100%', maxWidth: '100%'}} alt={'Template'}/>
                            </Card>
                        </Col>
                    ))
                }
            </Row>,
            onCancel: () => resolve(undefined),
            footer: null
        })
    );
}

export const useUrlInputModal = () => {
    const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

    return () => new Promise<string | undefined>(resolve =>
        Modal.info({
            closable: true,
            icon: <LinkOutlined/>,
            title: 'Enter image URL',
            content: <Input placeholder={'Image URL'} onChange={(e: any) => {
                setImageUrl(e.target.value)
            }}/>,
            onOk: () => {
                const url = imageUrl && imageUrl.trim();
                if (url && isImgUrl(url)) resolve(url);
                else resolve(undefined);
            }
        })
    );
}

export const useWebcamInputModal = () => {
    const webcamRef = useRef();

    return () => new Promise<string | undefined>(resolve =>
        Modal.info({
            closable: true,
            width: 690,
            icon: <CameraOutlined/>,
            title: 'Take a photo',
            bodyStyle: {paddingInline: 0},
            content: <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                <Webcam
                    width={640}
                    audio={false}
                    ref={webcamRef as any}
                    screenshotFormat={"image/jpeg"}
                />
            </div>,
            onOk: () => {
                if (webcamRef.current == null) return;

                const webcam = webcamRef.current as Webcam;
                const imageSrc = webcam.getScreenshot();

                if (imageSrc) fetch(imageSrc).then(res => res.blob()).then(blob => {
                    const url = URL.createObjectURL(blob);
                    resolve(url);
                });
            }
        })
    );
}

export const useShape = <T, >(id: string) => {
    const [shapes, setShapes] = useEditorState();
    const [shape, setShape] = useState<T>(shapes.find(s => s.id === id) as T);

    const updateShape = (values: Partial<Omit<T, 'id'>>) => {
        setShapes(prev => prev.map(s => s.id === id ? {...s, ...values} : s));
    }

    const deleteShape = () => {
        setShapes(shapes.filter(s => s.id !== id));
    }

    useEffect(() => {
        setShape(shapes.find(s => s.id === id) as T);
    }, [id, shapes]);

    return {shape, updateShape, deleteShape};
}

export const useDownloadModal = () => {
    const [shapes,] = useEditorState();
    const [stageRef,] = useStageRef();
    const [fileFormat, setFileFormat] = useState<string>('png');
    const [fileSize, setFileSize] = useState<number>(1000);

    // If no id is provided, download the current meme from the editor
    return (id?: string) => new Promise<string | undefined>(resolve => {
        Modal.info({
            title: 'Download',
            icon: <DownloadOutlined/>,
            content: <>
                <span style={{display: 'block', marginBottom: 5}}>File Size (KB):</span>
                <InputNumber style={{width: 200}} min={50} max={10000} value={fileSize} onChange={setFileSize as any}/>
                <span style={{display: 'block', marginTop: 20, marginBottom: 5}}>File Format:</span>
                <Select
                    style={{width: 200}}
                    defaultValue={fileFormat}
                    options={[{label: 'PNG', value: 'png'}, {label: 'JPEG', value: 'jpeg'}]}
                    value={fileFormat}
                    onChange={setFileFormat}
                />
            </>,
            onOk: async () => {
                let url = '';

                if (!id) {
                    url = stageRef.current.toDataURL();
                } else {
                    //  TODO: fetch meme url if id is given
                }

                // TODO: compress/resize to match file size
                downloadURI(url, 'meme.' + fileFormat);
                resolve(undefined);
            }
        })
    });
}

export const useCreateTemplateModal = () => {
    const [shapes,] = useEditorState();
    const {addTemplate} = useTemplates();
    const [name, setName] = useState<string>('');

    const handleNameChange = (e: any) => {
        console.log('name', e.target.value)
        setName(e.target.value);
    }

    return () => new Promise<string | undefined>(resolve => {
        Modal.info({
            closable: true,
            title: 'Create template',
            icon: <FormOutlined/>,
            content: <>
                <Input placeholder={'Template name (required)'} onChange={handleNameChange} required/>
            </>,
            onOk: async () => {
                console.log('name', name);

                if (name === '') throw new Error('Name is required');

                await addTemplate(name, shapes);

                // Reset
                setName('');

                resolve(undefined);
            }
        });
    });
}

export const useCreateMemeModal = () => {
    const [stageRef,] = useStageRef();
    const [name, setName] = useState<string>('');
    const [publishType, setPublishType] = useState<string>('public');
    const navigate = useNavigate();

    const handleNameChange = (e: any) => {
        setName(e.target.value);
    }

    const handlePublishTypeChange = (e: any) => {
        setPublishType(e.target.value);
    }

    return () => new Promise<string | undefined>(resolve => {
        Modal.info({
            closable: true,
            title: 'Create meme',
            icon: <PictureOutlined/>,
            content: <Space style={{width: '100%'}} size={'large'} direction={'vertical'}>
                <Input placeholder={'Meme name (required)'} onChange={handleNameChange} required/>
                <Radio.Group
                    options={[{label: 'Public', value: 'public'}, {
                        label: 'Private',
                        value: 'private'
                    }, {label: 'Unlisted', value: 'unlisted'}]}
                    onChange={handlePublishTypeChange}
                    value={publishType}
                    optionType="button"
                    buttonStyle="solid"
                />
            </Space>,
            onOk: async () => {
                if (name === '') throw new Error('Name is required');

                // TODO: publish meme on server (consider publish type)
                // TODO: and if logged in attribute to user
                const url = stageRef.current.toDataURL();
                const newMeme = {} as MemeType;

                navigate(`/memes/${newMeme.id}`);

                // Reset
                setName('');
                setPublishType('public');

                resolve(undefined);
            }
        });
    });
}
