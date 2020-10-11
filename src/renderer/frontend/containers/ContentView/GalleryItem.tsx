import React, { useState, useEffect, useCallback, useContext } from 'react';
import { shell } from 'electron';
import { observer } from 'mobx-react-lite';

import { ClientFile } from '../../../entities/File';
import { ClientTag } from '../../../entities/Tag';
import { Button, ButtonGroup, IconSet, Tag } from 'components';
import { MenuDivider, MenuItem } from 'components/menu';
import { Tooltip } from 'components/popover';
import ImageInfo from '../../components/ImageInfo';
import StoreContext from '../../contexts/StoreContext';
import { DnDType, DnDAttribute } from '../Outliner/TagsPanel/DnD';
import { ensureThumbnail } from '../../ThumbnailGeneration';
import { RendererMessenger } from 'src/Messaging';

interface IThumbnailTags {
  tags: ClientTag[];
  onClick: (event: React.MouseEvent<HTMLSpanElement, MouseEvent>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLSpanElement, MouseEvent>) => void;
}

const ThumbnailTags = observer(({ tags, onClick, onDoubleClick }: IThumbnailTags) => (
  <span className="thumbnail-tags" onClick={onClick} onDoubleClick={onDoubleClick}>
    {tags.map((tag) => (
      <Tag key={tag.id} text={tag.name} color={tag.viewColor} />
    ))}
  </span>
));

const FileRecovery = observer(({ file }: { file: ClientFile }) => {
  const { uiStore } = useContext(StoreContext);
  return (
    <div>
      <p>The file {file.name} could not be found.</p>
      <p>Would you like to remove it from your library?</p>
      <ButtonGroup>
        <Button
          text="Remove"
          styling="outlined"
          onClick={() => {
            uiStore.selectFile(file, true);
            uiStore.openToolbarFileRemover();
          }}
        />
      </ButtonGroup>
    </div>
  );
});

interface IThumbnailDecoration extends Omit<IThumbnailTags, 'tags'> {
  showDetails?: boolean;
  file: ClientFile;
}

const ThumbnailDecoration = observer(
  ({ showDetails, file, onClick, onDoubleClick }: IThumbnailDecoration) => {
    if (file.isBroken && showDetails) {
      return <FileRecovery file={file} />;
    }
    return (
      <>
        {showDetails && (
          <>
            <h2>{file.filename}</h2>
            <ImageInfo file={file} />
          </>
        )}
        <ThumbnailTags tags={file.clientTags} onClick={onClick} onDoubleClick={onDoubleClick} />
      </>
    );
  },
);

interface IGalleryItemProps {
  file: ClientFile;
  select: (selectedFile: ClientFile, selectAdditive: boolean, selectRange: boolean) => void;
  showDetails?: boolean;
  showContextMenu: (x: number, y: number, menu: [JSX.Element, JSX.Element]) => void;
}

const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
  if (event.dataTransfer.types.includes(DnDType)) {
    event.dataTransfer.dropEffect = 'link';
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.dataset[DnDAttribute.Target] = 'true';
  }
};

const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
  if (event.dataTransfer.types.includes(DnDType)) {
    event.dataTransfer.dropEffect = 'none';
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.dataset[DnDAttribute.Target] = 'false';
  }
};

export const MissingImageFallback = ({ style }: { style?: React.CSSProperties }) => (
  <div style={style} className="image-error custom-icon-128">
    {IconSet.DB_ERROR}Could not load image
  </div>
);

const GalleryItem = observer(
  ({ file, select, showDetails, showContextMenu }: IGalleryItemProps) => {
    const { uiStore, fileStore } = useContext(StoreContext);
    const isSelected = uiStore.fileSelection.has(file.id);

    const handleDrop = useCallback(
      (event: React.DragEvent<HTMLDivElement>) => {
        if (event.dataTransfer.types.includes(DnDType)) {
          event.dataTransfer.dropEffect = 'none';
          const ctx = uiStore.getTagContextItems(event.dataTransfer.getData(DnDType));
          ctx.tags.forEach((tag) => {
            file.addTag(tag.id);
            tag.subTags.forEach(file.addTag);
          });
          event.currentTarget.dataset[DnDAttribute.Target] = 'false';
        }
      },
      [file, uiStore],
    );

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation(); // avoid propogation to background
        select(file, e.ctrlKey || e.metaKey, e.shiftKey);
      },
      [file, select],
    );

    // Slide view when double clicking
    const handleDoubleClick = useCallback(() => {
      uiStore.selectFile(file, true);
      uiStore.enableSlideMode();
    }, [file, uiStore]);

    // Initially, we assume the thumbnail exists
    const [isThumbnailReady, setThumbnailReady] = useState(true);
    const [isThumbnailGenerating, setThumbnailGenerating] = useState(false);

    const imagePath = uiStore.isSlideMode ? file.absolutePath : file.thumbnailPath;

    useEffect(() => {
      // This will check whether a thumbnail exists, generate it if needed
      ensureThumbnail(file, uiStore.thumbnailDirectory).then((exists) => {
        if (!exists) {
          setThumbnailReady(false);
          if (!file.isBroken) {
            // can't genarate thumbnail if img doesn't exist
            setThumbnailGenerating(true);
          }
        }
      });
    }, [file, uiStore.thumbnailDirectory]);

    // The thumbnailPath of an image is always set, but may not exist yet.
    // When the thumbnail is finished generating, the path will be changed to `${thumbnailPath}?v=1`,
    // which we detect here to know the thumbnail is ready
    useEffect(() => {
      if (imagePath.endsWith('?v=1')) {
        setThumbnailReady(true);
        setThumbnailGenerating(false);
      }
    }, [imagePath]);

    // When the thumbnail cannot be loaded, display an error
    const handleImageError = useCallback(
      (err: any) => {
        console.log('Could not load image:', imagePath, err);
        setThumbnailReady(false);
      },
      [imagePath],
    );

    const handleDragStart = useCallback(
      async (e: React.DragEvent<HTMLImageElement>) => {
        // If file is selected, add all selected items to the drag event, for exporting e.g. to your file explorer or programs like PureRef
        // Creating an event in the main process turned out to be the most robust, did many experiments with drag event content types.
        // Creating a drag event with multiple images did not work correctly from the browser side (e.g. only limited to thumbnails, not full images)
        if (isSelected && uiStore.fileSelection.size > 1) {
          e.preventDefault();
          RendererMessenger.startDragExport({
            absolutePaths: uiStore.clientFileSelection.map((f) => f.absolutePath),
          });
        } else {
          RendererMessenger.startDragExport({ absolutePaths: [file.absolutePath] });
        }

        // However, from the main process, there is no way to attach some information to indicate it's an "internal event" that shouldn't trigger the drop overlay
        // So we can store the date when the event starts... Hacky but it works :)
        (window as any).internalDragStart = new Date();
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [file, isSelected, uiStore.fileSelection, uiStore.fileSelection.size],
    );

    // TODO: When a filename contains https://x/y/z.abc?323 etc., it can't be found
    // e.g. %2F should be %252F on filesystems. Something to do with decodeURI, but seems like only on the filename - not the whole path

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        showContextMenu(e.clientX, e.clientY, [
          file.isBroken ? <MissingFileMenuItems /> : <FileViewerMenuItems file={file} />,
          file.isBroken ? <></> : <ExternalAppMenuItems path={file.absolutePath} />,
        ]);
      },
      [file, showContextMenu],
    );

    return (
      <div
        className="thumbnail"
        aria-selected={isSelected}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
      >
        <div
          onClick={handleClick}
          className={`thumbnail-img${file.isBroken ? ' thumbnail-broken' : ''}`}
          onDoubleClick={handleDoubleClick}
          onDragStart={handleDragStart}
        >
          {isThumbnailReady ? (
            // Show image when it has been loaded
            <img src={imagePath} onError={handleImageError} alt="" />
          ) : isThumbnailGenerating ? (
            // If it's being generated, show a placeholder
            <div className="donut-loading" />
          ) : (
            // Show an error it it could not be loaded
            <MissingImageFallback />
          )}
          {file.isBroken && !showDetails && (
            <Tooltip content="This image could not be found.">
              <span
                className="thumbnail-broken-overlay"
                onClick={(e) => {
                  e.stopPropagation(); // prevent image click event
                  fileStore.fetchMissingFiles();
                  uiStore.selectFile(file, true);
                }}
              >
                {IconSet.WARNING_BROKEN_LINK}
              </span>
            </Tooltip>
          )}
        </div>
        <ThumbnailDecoration
          showDetails={showDetails}
          file={file}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
      </div>
    );
  },
);

const MissingFileMenuItems = () => {
  const { uiStore, fileStore } = useContext(StoreContext);
  return (
    <>
      <MenuItem
        onClick={fileStore.fetchMissingFiles}
        text="Open Recovery Panel"
        icon={IconSet.WARNING_BROKEN_LINK}
        disabled={fileStore.showsMissingContent}
      />
      <MenuItem onClick={uiStore.openToolbarFileRemover} text="Delete" icon={IconSet.DELETE} />
    </>
  );
};

const FileViewerMenuItems = ({ file }: { file: ClientFile }) => {
  const { uiStore } = useContext(StoreContext);
  const handleViewFullSize = useCallback(() => {
    uiStore.selectFile(file, true);
    uiStore.toggleSlideMode();
  }, [file, uiStore]);

  const handlePreviewWindow = useCallback(() => {
    if (!uiStore.fileSelection.has(file.id)) {
      uiStore.selectFile(file, true);
    }
    uiStore.openPreviewWindow();
  }, [file, uiStore]);

  const handleInspect = useCallback(() => {
    uiStore.clearFileSelection();
    uiStore.selectFile(file);
    if (!uiStore.isInspectorOpen) {
      uiStore.toggleInspector();
    }
  }, [file, uiStore]);

  return (
    <>
      <MenuItem onClick={handleViewFullSize} text="View at Full Size" icon={IconSet.SEARCH} />
      <MenuItem
        onClick={handlePreviewWindow}
        text="Open In Preview Window"
        icon={IconSet.PREVIEW}
      />
      <MenuItem onClick={handleInspect} text="Inspect" icon={IconSet.INFO} />
    </>
  );
};

const ExternalAppMenuItems = ({ path }: { path: string }) => {
  const handleOpen = useCallback(() => shell.openPath(path), [path]);
  const handleOpenFileExplorer = useCallback(() => shell.showItemInFolder(path), [path]);
  return (
    <>
      <MenuDivider />
      <MenuItem onClick={handleOpen} text="Open External" icon={IconSet.OPEN_EXTERNAL} />
      <MenuItem
        onClick={handleOpenFileExplorer}
        text="Reveal in File Browser"
        icon={IconSet.FOLDER_CLOSE}
      />
    </>
  );
};

// A simple version of the GalleryItem, only rendering the minimally required info (thumbnail + name)
const SimpleGalleryItem = observer(({ file, showDetails }: IGalleryItemProps) => {
  return (
    <div className="thumbnail">
      <div className="thumbnail-img">
        <img src={file.thumbnailPath} alt="" />
      </div>
      {showDetails && (
        <>
          <h2>{file.filename}</h2>
          <ImageInfo file={file} />
        </>
      )}
      <span className="thumbnail-tags" />
    </div>
  );
});

const DelayedGalleryItem = (props: IGalleryItemProps) => {
  const [showSimple, setShowSimple] = useState(true);
  useEffect(() => {
    const timeout = setTimeout(() => setShowSimple(false), 300);
    return () => clearTimeout(timeout);
  });
  return showSimple ? <SimpleGalleryItem {...props} /> : <GalleryItem {...props} />;
};

export default observer(DelayedGalleryItem);
