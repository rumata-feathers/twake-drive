import { ChevronDownIcon } from '@heroicons/react/outline';
import { Button } from '@atoms/button/button';
import { Base, BaseSmall, Subtitle, Title } from '@atoms/text';
import Menu from '@components/menus/menu';
import { getFilesTree } from '@components/uploads/file-tree-utils';
import UploadZone from '@components/uploads/upload-zone';
import { setTdriveTabToken } from '@features/drive/api-client/api-client';
import { useDriveItem } from '@features/drive/hooks/use-drive-item';
import { useDriveUpload } from '@features/drive/hooks/use-drive-upload';
import { DriveItemSelectedList, DriveItemSort } from '@features/drive/state/store';
import { formatBytes } from '@features/drive/utils';
import useRouterCompany from '@features/router/hooks/use-router-company';
import _, { set } from 'lodash';
import { memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { atomFamily, useRecoilState, useSetRecoilState, useRecoilValue } from 'recoil';
import { DrivePreview } from '../../viewer/drive-preview';
import {
  useOnBuildContextMenu,
  useOnBuildFileTypeContextMenu,
  useOnBuildPeopleContextMenu,
  useOnBuildDateContextMenu,
  useOnBuildSortContextMenu,
} from './context-menu';
import {DocumentRow, DocumentRowOverlay} from './documents/document-row';
import { FolderRow } from './documents/folder-row';
import { FolderRowSkeleton } from './documents/folder-row-skeleton';
import HeaderPath from './header-path';
import { ConfirmDeleteModal } from './modals/confirm-delete';
import { ConfirmTrashModal } from './modals/confirm-trash';
import { CreateModalAtom } from './modals/create';
import { UploadModelAtom } from './modals/upload'
import { PropertiesModal } from './modals/properties';
import { AccessModal } from './modals/update-access';
import { PublicLinkModal } from './modals/public-link';
import { VersionsModal } from './modals/versions';
import { UsersModal } from './modals/manage-users';
import { SharedFilesTable } from './shared-files-table';
import RouterServices from '@features/router/services/router-service';
import useRouteState from 'app/features/router/hooks/use-route-state';
import { SharedWithMeFilterState } from '@features/drive/state/shared-with-me-filter';
import MenusManager from '@components/menus/menus-manager.jsx';
import Languages from 'features/global/services/languages-service';
import {DndContext, useSensors, useSensor, PointerSensor, DragOverlay} from '@dnd-kit/core';
import { Droppable } from 'app/features/dragndrop/hook/droppable';
import { Draggable } from 'app/features/dragndrop/hook/draggable';
import { useDriveActions } from '@features/drive/hooks/use-drive-actions';
import { ConfirmModalAtom } from './modals/confirm-move/index';
import { useCurrentUser } from 'app/features/users/hooks/use-current-user';
import { ConfirmModal } from './modals/confirm-move';
import { useHistory } from 'react-router-dom';
import { SortIcon } from 'app/atoms/icons-agnostic';
import { useDrivePreview, useDrivePreviewLoading } from 'app/features/drive/hooks/use-drive-preview';

export const DriveCurrentFolderAtom = atomFamily<
    string,
    { context?: string; initialFolderId: string }
>({
  key: 'DriveCurrentFolderAtom',
  default: options => options.initialFolderId || 'root',
});

export default memo(
  ({
    context,
    initialParentId,
    tdriveTabContextToken,
    inPublicSharing,
  }: {
    context?: string;
    initialParentId?: string;
    tdriveTabContextToken?: string;
    inPublicSharing?: boolean;
  }) => {
    const { user } = useCurrentUser();
    const companyId = useRouterCompany();
    const history = useHistory();
    const role = user
      ? (user?.companies || []).find(company => company?.company.id === companyId)?.role
      : 'member';
    setTdriveTabToken(tdriveTabContextToken || null);
    const [filter, __] = useRecoilState(SharedWithMeFilterState);
    const { viewId, dirId, itemId } = useRouteState();
    const { status } = useDrivePreview();
    const { openWithId, close } = useDrivePreview();
    const [sortLabel] = useRecoilState(DriveItemSort)
    const { loading: isModalLoading } = useDrivePreviewLoading();
    const [parentId, _setParentId] = useRecoilState(
      DriveCurrentFolderAtom({
        context: context,
        initialFolderId: dirId || viewId || initialParentId || 'user_' + user?.id,
      }),
    );

    // set the initial view to the user's home directory
    useEffect(() => {
      !dirId &&
        !viewId &&
        history.push(RouterServices.generateRouteFromState({ viewId: parentId }));
    }, [viewId, dirId]);



    const [loadingParentChange, setLoadingParentChange] = useState(false);
    const {
      sharedWithMe,
      details,
      access,
      item,
      inTrash,
      refresh,
      children,
      loading: loadingParent,
      path,
      loadNextPage,
    } = useDriveItem(parentId);
    const { uploadTree } = useDriveUpload();

    const loading = loadingParent || loadingParentChange;

    const uploadZone = 'drive_' + companyId;
    const uploadZoneRef = useRef<UploadZone | null>(null);

    const setCreationModalState = useSetRecoilState(CreateModalAtom);
    const setUploadModalState = useSetRecoilState(UploadModelAtom);

    const [checked, setChecked] = useRecoilState(DriveItemSelectedList);

    const setParentId = useCallback(
      async (id: string) => {
        setLoadingParentChange(true);
        try {
          await refresh(id);
          _setParentId(id);
        } catch (e) {
          console.error(e);
        }
        setLoadingParentChange(false);
      },
      [_setParentId],
    );

    useEffect(() => {
      setChecked({});
      refresh(parentId);
      if (!inPublicSharing) refresh('trash');
    }, [parentId, refresh, filter]);

    const uploadItemModal = useCallback(() => {
      if (item?.id) setUploadModalState({ open: true, parent_id: item.id });
    }, [item?.id, setUploadModalState]);

    const documents = (
      item?.is_directory === false
        ? //We use this hack for public shared single file
          item
          ? [item]
          : []
        : children
    ).filter(i => !i.is_directory);

    const selectedCount = Object.values(checked).filter(v => v).length;

    const onBuildContextMenu = useOnBuildContextMenu(children, initialParentId);
    const onBuildSortContextMenu = useOnBuildSortContextMenu();

    const handleDragOver = (event: { preventDefault: () => void }) => {
      event.preventDefault();
    };
    const handleDrop = async (event: { dataTransfer: any; preventDefault: () => void }) => {
      event.preventDefault();
      const dataTransfer = event.dataTransfer;
      if (dataTransfer) {
        const tree = await getFilesTree(dataTransfer);
        setCreationModalState({ parent_id: '', open: false });
        await uploadTree(tree, {
          companyId,
          parentId,
        });
      }
    };

    const buildFileTypeContextMenu = useOnBuildFileTypeContextMenu();
    const buildPeopleContextMen = useOnBuildPeopleContextMenu();
    const buildDateContextMenu = useOnBuildDateContextMenu();
    const setConfirmModalState = useSetRecoilState(ConfirmModalAtom);
    const [activeIndex, setActiveIndex] = useState(null);
    const [activeChild, setActiveChild] = useState(null);
    const { update } = useDriveActions();
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: {
          distance: 8,
        },
      }),
    );
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    function handleDragStart(event: any) {
      setActiveIndex(event.active.id);
      setActiveChild(event.active.data.current.child.props.item);
    }
    function handleDragEnd(event: any) {
      setActiveIndex(null);
      setActiveChild(null);
      if (event.over) {
        setConfirmModalState({
          open: true,
          parent_id: inTrash ? 'root' : event.over.data.current.child.props.item.id,
          mode: 'move',
          title:
            Languages.t('components.item_context_menu.move.modal_header') +
            ` '${event.active.data.current.child.props.item.name}'`,
          onSelected: async ids => {
            await update(
              {
                parent_id: ids[0],
              },
              event.active.data.current.child.props.item.id,
              event.active.data.current.child.props.item.parent_id,
            );
          },
        });
      }
    }

    function draggableMarkup(index: number, child: any) {
      const commonProps = {
        key: index,
        className:
          (index === 0 ? 'rounded-t-md ' : '') +
          (index === documents.length - 1 ? 'rounded-b-md ' : ''),
        item: child,
        checked: checked[child.id] || false,
        onCheck: (v: boolean) => setChecked(_.pickBy({ ...checked, [child.id]: v }, _.identity)),
        onBuildContextMenu: () => onBuildContextMenu(details, child),
        inPublicSharing,
      };
      return isMobile ? (
        <DocumentRow {...commonProps} />
      ) : (
        <Draggable id={index}>
          <DocumentRow {...commonProps} />
        </Draggable>
      );
    }

    // Infinite scroll
    const scrollViwer = useRef<HTMLDivElement>(null);

    const handleScroll = async () => {
      const scrollTop = scrollViwer.current?.scrollTop || 0;
      const scrollHeight = scrollViwer.current?.scrollHeight || 0;
      const clientHeight = scrollViwer.current?.clientHeight || 0;
      if (scrollTop > 0 && scrollTop + clientHeight >= scrollHeight) {
        await loadNextPage(parentId);
      }
    };

    useEffect(() => {
      if(!loading) scrollViwer.current?.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        scrollViwer.current?.removeEventListener('scroll', handleScroll);
      };
    }, [parentId, loading]);

    return (
      <>
        {viewId == 'shared-with-me' ? (
          <>
            <Suspense fallback={<></>}>
              <DrivePreview items={documents} />
            </Suspense>
            <SharedFilesTable />
          </>
        ) : (
          <UploadZone
            overClassName={''}
            className="h-full overflow-hidden"
            disableClick
            parent={''}
            multiple={true}
            allowPaste={true}
            ref={uploadZoneRef}
            driveCollectionKey={uploadZone}
            onAddFiles={async (_, event) => {
              const tree = await getFilesTree(event);
              setCreationModalState({ parent_id: '', open: false });
              uploadTree(tree, {
                companyId,
                parentId,
              });
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {role == 'admin' && <UsersModal />}
            <VersionsModal />
            <AccessModal />
            <PublicLinkModal />
            <PropertiesModal />
            <ConfirmDeleteModal />
            <ConfirmTrashModal />
            <ConfirmModal />
            <Suspense fallback={<></>}>
              <DrivePreview items={documents} />
            </Suspense>
            <div
              className={
                'flex flex-col grow h-full overflow-hidden ' +
                (loading && (!children?.length || loadingParentChange) ? 'opacity-50 ' : '')
              }
            >
              <div className="flex flex-row shrink-0 items-center mb-4">
                {sharedWithMe ? (
                  <div>
                    <Title className="mb-4 block">
                      {Languages.t('scenes.app.shared_with_me.shared_with_me')}
                    </Title>
                    {/* Filters */}
                    <div className="flex items-center space-x-4 mb-6">
                      <div className="">
                        <Button
                          theme="secondary"
                          className="flex items-center"
                          onClick={evt => {
                            MenusManager.openMenu(
                              buildFileTypeContextMenu(),
                              { x: evt.clientX, y: evt.clientY },
                              'center',
                            );
                          }}
                        >
                          <span>
                            {filter.mimeType.key && filter.mimeType.key != 'All'
                              ? filter.mimeType.key
                              : Languages.t('scenes.app.shared_with_me.file_type')}
                          </span>
                          <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                        </Button>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          theme="secondary"
                          className="flex items-center"
                          onClick={evt => {
                            MenusManager.openMenu(
                              buildPeopleContextMen(),
                              { x: evt.clientX, y: evt.clientY },
                              'center',
                            );
                          }}
                        >
                          <span>{Languages.t('scenes.app.shared_with_me.people')}</span>
                          <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                        </Button>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Button
                          theme="secondary"
                          className="flex items-center"
                          onClick={evt => {
                            MenusManager.openMenu(
                              buildDateContextMenu(),
                              { x: evt.clientX, y: evt.clientY },
                              'center',
                            );
                          }}
                        >
                          <span>
                            {filter.date.key && filter.date.key != 'All'
                              ? filter.date.key
                              : Languages.t('scenes.app.shared_with_me.last_modified')}
                          </span>
                          <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <HeaderPath
                    path={path || []}
                    inTrash={inTrash}
                    setParentId={setParentId}
                    inPublicSharing={inPublicSharing}
                  />
                )}
                <div className="grow" />

                {access !== 'read' && (
                  <BaseSmall>
                    {formatBytes(item?.size || 0)} {Languages.t('scenes.app.drive.used')}
                  </BaseSmall>
                )}

                <Menu menu={() => onBuildSortContextMenu()} sortData={sortLabel}>
                  {' '}
                  <Button theme="outline" className="ml-4 flex flex-row items-center">
                    <SortIcon
                      className={`h-4 w-4 mr-2 -ml-1 ${
                        sortLabel.order === 'asc' ? 'transform rotate-180' : ''
                      }`}
                    />
                    <span>By {sortLabel.by}</span>
                    <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                  </Button>
                </Menu>
                {viewId !== 'shared_with_me' && (
                  <Menu menu={() => onBuildContextMenu(details)}>
                    {' '}
                    <Button theme="secondary" className="ml-4 flex flex-row items-center">
                      <span>
                        {selectedCount > 1
                          ? `${selectedCount} items`
                          : Languages.t('scenes.app.drive.context_menu')}{' '}
                      </span>

                      <ChevronDownIcon className="h-4 w-4 ml-2 -mr-1" />
                    </Button>
                  </Menu>
                )}
              </div>

              <DndContext sensors={sensors} onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
                <div className="grow overflow-auto" ref={scrollViwer}>
                  {documents.length === 0 && !loading && (
                    <div className="mt-4 text-center border-2 border-dashed rounded-md p-8">
                      <Subtitle className="block mb-2">
                        {Languages.t('scenes.app.drive.nothing')}
                      </Subtitle>
                      {!inTrash && access != 'read' && (
                        <>
                          <Base>{Languages.t('scenes.app.drive.drag_and_drop')}</Base>
                          <br />
                          <Button
                            onClick={() => uploadItemModal()}
                            theme="primary"
                            className="mt-4"
                          >
                            {Languages.t('scenes.app.drive.add_doc')}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {children.map((child, index) =>
                    child.is_directory ? (
                      <Droppable id={index} key={index}>
                        <FolderRow
                          key={index}
                          className={
                            (index === 0 ? 'rounded-t-md ' : '') +
                            (index === children.length - 1 ? 'rounded-b-md ' : '')
                          }
                          item={child}
                          onClick={() => {
                            const route = RouterServices.generateRouteFromState({
                              dirId: child.id,
                            });
                            history.push(route);
                            if (inPublicSharing) return setParentId(child.id);
                          }}
                          checked={checked[child.id] || false}
                          onCheck={v =>
                            setChecked(_.pickBy({ ...checked, [child.id]: v }, _.identity))
                          }
                          onBuildContextMenu={() => onBuildContextMenu(details, child)}
                        />
                      </Droppable>
                    ) : (
                      draggableMarkup(index, child)
                    ),
                  )}
                  <DragOverlay>
                    {activeIndex ? (
                      <DocumentRowOverlay
                        className={
                          (activeIndex === 0 ? 'rounded-t-md ' : '') +
                          (activeIndex === children.length - 1 ? 'rounded-b-md ' : '')
                        }
                        item={activeChild}
                      ></DocumentRowOverlay>
                    ) : null}
                  </DragOverlay>
                  {loading && <FolderRowSkeleton />}
                </div>
              </DndContext>
            </div>
          </UploadZone>
        )}
      </>
    );
  },
);
