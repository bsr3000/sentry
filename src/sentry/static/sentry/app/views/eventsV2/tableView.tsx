import React from 'react';
import {Location} from 'history';
import {omit} from 'lodash';
import styled from 'react-emotion';
import {browserHistory} from 'react-router';

import {t} from 'app/locale';
import {Organization} from 'app/types';
import space from 'app/styles/space';

import Alert from 'app/components/alert';
import EmptyStateWarning from 'app/components/emptyStateWarning';
import GridEditable from 'app/components/gridEditable';
import LoadingContainer from 'app/components/loading/loadingContainer';
import Panel from 'app/components/panels/panel';
import Placeholder from 'app/components/placeholder';

import {
  decodeColumnOrderAndColumnSortBy,
  encodeColumnOrderAndColumnSortBy,
  getFieldRenderer,
} from './utils';
import EventView from './eventView';
import SortLink from './sortLink';
import tableModalEditColumn from './tableModalEditColumn';
import {
  TableColumn,
  TableColumnSort,
  TableState,
  TableData,
  TableDataRow,
} from './tableTypes';

export type TableViewProps = {
  location: Location;
  organization: Organization;

  isLoading: boolean;
  error: string | null;

  eventView: EventView;
  tableData: TableData | null | undefined;
};
export type TableViewState = TableState & {
  hasQueryBuilder: boolean;
};

/**
 * `TableView` is currently in turmoil as it is containing 2 implementations
 * of the Discover V2 QueryBuilder.
 *
 * The old `TableView` is split away from `table.tsx` file as it was too long
 * and its methods have not been changed. It reads its state from `EventView`,
 * which is shared across several component.
 *
 * The new `TableView` is marked with leading _ in its method names. It
 * is coupled to the `Location` object and derives its state entirely from it.
 * It implements methods to mutate the column state in `Location.query`.
 */
class TableView extends React.Component<TableViewProps, TableViewState> {
  constructor(props) {
    super(props);

    this.setState = () => {
      throw new Error(
        'TableView: Please do not directly mutate the state of TableView. You can read the comments on TableView.addColumn for more information.'
      );
    };
  }

  state = {
    columnOrder: [],
    columnSortBy: [],
    hasQueryBuilder: false,
  } as TableViewState;

  static getDerivedStateFromProps(props: TableViewProps): TableViewState {
    const hasQueryBuilder =
      props.organization.features.indexOf('discover-v2-query-builder') > -1;

    return {
      hasQueryBuilder,
      ...decodeColumnOrderAndColumnSortBy(props.location),
    };
  }

  /**
   * The state of the columns is derived from `Location.query`. There are other
   * components mutating the state of the column (sidebar, etc) too.
   *
   * To make add/edit/remove tableColumns, we will update `Location.query` and
   * the changes will be propagated downwards to all the other components.
   *
   *
   * todo(leedongwei): 18 Sept 2019
   * It may be a good idea to move this method somewhere else so that other
   * components mutating the column state can use it too.
   */
  _setColumnState = (
    nextColumnOrder: TableColumn<keyof TableDataRow>[],
    nextColumnSortBy: TableColumnSort<keyof TableDataRow>[]
  ) => {
    const {location} = this.props;

    browserHistory.push({
      ...location,
      query: {
        ...location.query,
        ...encodeColumnOrderAndColumnSortBy({
          columnOrder: nextColumnOrder,
          columnSortBy: nextColumnSortBy,
        }),
      },
    });
  };

  /**
   * Because the "truth" on the state of the columns is found in `Location`,
   * `addColumn`, `updateColumn`, `deleteColumn` and `moveColumn` copies some
   * ideas from Redux / Functional Programming.
   *
   * It creates an entire new state and passes it to `_setColumnState`.
   * It does not mutate the local state at all to prevent side-effects and
   * ensure that there will always be a single source of truth.
   */
  _addColumn = (nextColumn: TableColumn<keyof TableDataRow>, i: number) => {
    const {columnOrder, columnSortBy} = this.state;
    const nextColumnOrder = [...columnOrder];
    const nextColumnSortBy = [...columnSortBy];

    nextColumnOrder.splice(i, 0, nextColumn);
    this._setColumnState(nextColumnOrder, nextColumnSortBy);
  };

  /**
   * Please read the comment on `addColumn`
   */
  _updateColumn = (nextColumn: TableColumn<keyof TableDataRow>, i: number) => {
    const {columnOrder, columnSortBy} = this.state;
    const nextColumnOrder = [...columnOrder];
    const nextColumnSortBy = [...columnSortBy];

    if (nextColumnOrder[i].key !== nextColumn.key) {
      throw new Error(
        'TableView.updateColumn: nextColumn does not have the same key as prevColumn'
      );
    }

    nextColumnOrder[i] = nextColumn;
    this._setColumnState(nextColumnOrder, nextColumnSortBy);
  };

  /**
   * Please read the comment on `addColumn`
   */
  _deleteColumn = (i: number) => {
    const {columnOrder, columnSortBy} = this.state;
    const nextColumnOrder = [...columnOrder];
    const nextColumnSortBy = [...columnSortBy];

    // Disallow delete of last column and check for out-of-bounds
    if (columnOrder.length === 1 || nextColumnOrder.length <= i) {
      return;
    }

    // Remove column from columnOrder
    const deletedColumn = nextColumnOrder.splice(i, 1)[0];

    // Remove column from columnSortBy (if it is there)
    // EventView will throw an error if sorting by a column that isn't displayed
    const j = columnSortBy.findIndex(c => c.key === deletedColumn.key);
    if (j >= 0) {
      nextColumnSortBy.splice(i, 1);
    }

    this._setColumnState(nextColumnOrder, nextColumnSortBy);
  };

  /**
   * Please read the comment on `addColumn`
   */
  _moveColumn = (fromIndex: number, toIndex: number) => {
    const {columnOrder, columnSortBy} = this.state;
    const nextColumnOrder = [...columnOrder];
    const nextColumnSortBy = [...columnSortBy];

    nextColumnOrder.splice(toIndex, 0, nextColumnOrder.splice(fromIndex, 1)[0]);
    this._setColumnState(nextColumnOrder, nextColumnSortBy);
  };

  _renderGridHeaderCell = (column: TableColumn<keyof TableDataRow>): React.ReactNode => {
    const {eventView, location, tableData} = this.props;
    if (!tableData) {
      return column.name;
    }

    // tood(leedongwei): Deprecate eventView and use state.columnSortBy
    const defaultSort = eventView.getDefaultSort() || eventView.fields[0].field;

    return (
      <SortLink
        defaultSort={defaultSort}
        sortKey={`${column.key}`}
        title={column.name}
        location={location}
      />
    );
  };

  _renderGridBodyCell = (
    column: TableColumn<keyof TableDataRow>,
    dataRow: TableDataRow
  ): React.ReactNode => {
    const {location, organization, tableData} = this.props;

    if (!tableData) {
      return dataRow[column.key];
    }

    const fieldRenderer = getFieldRenderer(String(column.key), tableData.meta, true);
    return fieldRenderer(dataRow, {organization, location});
  };

  renderHeader = () => {
    const {eventView, location, tableData} = this.props;

    if (eventView.fields.length <= 0) {
      return null;
    }

    const defaultSort = eventView.getDefaultSort() || eventView.fields[0].field;

    return eventView.fields.map((field, index) => {
      if (!tableData) {
        return <PanelHeaderCell key={index}>{field.title}</PanelHeaderCell>;
      }

      const {meta} = tableData;
      const sortKey = eventView.getSortKey(field.field, meta);

      if (sortKey === null) {
        return <PanelHeaderCell key={index}>{field.title}</PanelHeaderCell>;
      }

      return (
        <PanelHeaderCell key={index}>
          <SortLink
            defaultSort={defaultSort}
            sortKey={sortKey}
            title={field.title}
            location={location}
          />
        </PanelHeaderCell>
      );
    });
  };

  renderContent = (): React.ReactNode => {
    const {
      isLoading,
      tableData: dataPayload,
      eventView,
      organization,
      location,
    } = this.props;

    if (isLoading && !dataPayload) {
      return (
        <PanelGridInfo numOfCols={eventView.numOfColumns()}>
          <Placeholder height="240px" width="100%" />
        </PanelGridInfo>
      );
    }
    if (!(dataPayload && dataPayload.data && dataPayload.data.length > 0)) {
      return (
        <PanelGridInfo numOfCols={eventView.numOfColumns()}>
          <EmptyStateWarning>
            <p>{t('No results found')}</p>
          </EmptyStateWarning>
        </PanelGridInfo>
      );
    }

    const {meta} = dataPayload;
    const fields = eventView.getFieldNames();
    const lastRowIndex = dataPayload.data.length - 1;
    const hasLinkField = eventView.hasAutolinkField();
    const firstCellIndex = 0;
    const lastCellIndex = fields.length - 1;

    return dataPayload.data.map((row, rowIndex) => {
      return (
        <React.Fragment key={rowIndex}>
          {fields.map((field, columnIndex) => {
            const key = `${field}.${columnIndex}`;
            const forceLinkField = !hasLinkField && columnIndex === 0;

            const fieldRenderer = getFieldRenderer(field, meta, forceLinkField);
            return (
              <PanelItemCell
                hideBottomBorder={rowIndex === lastRowIndex}
                style={{
                  paddingLeft: columnIndex === firstCellIndex ? space(1) : void 0,
                  paddingRight: columnIndex === lastCellIndex ? space(1) : void 0,
                }}
                key={key}
              >
                {fieldRenderer(row, {organization, location})}
              </PanelItemCell>
            );
          })}
        </React.Fragment>
      );
    });
  };

  renderTable() {
    const {isLoading, tableData: dataPayload} = this.props;
    return (
      <React.Fragment>
        {this.renderHeader()}
        {isLoading && (
          <FloatingLoadingContainer
            isLoading={true}
            isReloading={isLoading && !!dataPayload}
          />
        )}
        {this.renderContent()}
      </React.Fragment>
    );
  }

  renderError() {
    const {error, eventView} = this.props;
    return (
      <React.Fragment>
        <Alert type="error" icon="icon-circle-exclamation">
          {error}
        </Alert>
        {this.renderHeader()}
        <PanelGrid numOfCols={eventView.numOfColumns()}>{this.renderHeader()}</PanelGrid>
      </React.Fragment>
    );
  }

  render() {
    const {eventView, isLoading, error, tableData} = this.props;
    const {hasQueryBuilder, columnOrder, columnSortBy} = this.state;
    const {renderModalBody, renderModalFooter} = tableModalEditColumn;

    if (hasQueryBuilder) {
      return (
        <GridEditable
          isEditable={hasQueryBuilder}
          isLoading={isLoading}
          error={error}
          data={tableData ? tableData.data : []}
          columnOrder={columnOrder}
          columnSortBy={columnSortBy}
          grid={{
            renderHeaderCell: this._renderGridHeaderCell as any,
            renderBodyCell: this._renderGridBodyCell as any,
          }}
          modalEditColumn={{
            renderBodyWithForm: renderModalBody as any,
            renderFooter: renderModalFooter,
          }}
          actions={{
            deleteColumn: this._deleteColumn,
            moveColumn: this._moveColumn,
          }}
        />
      );
    }

    // GridResizable has its own error-handling, but PanelGrid does not.
    if (error) {
      return this.renderError();
    }

    return (
      <PanelGrid numOfCols={eventView.numOfColumns()}>{this.renderTable()}</PanelGrid>
    );
  }
}

export default TableView;

type PanelGridProps = {
  numOfCols: number;
};
const PanelGrid = styled((props: PanelGridProps) => {
  const otherProps = omit(props, 'numOfCols');
  return <Panel {...otherProps} />;
})<PanelGridProps>`
  display: grid;

  overflow-x: auto;

  ${(props: PanelGridProps) => {
    const firstColumn = '3fr';

    function generateRestColumns(): string {
      if (props.numOfCols <= 1) {
        return '';
      }

      return `repeat(${props.numOfCols - 1}, auto)`;
    }

    return `
      grid-template-columns:  ${firstColumn} ${generateRestColumns()};
    `;
  }};
`;

const PanelHeaderCell = styled('div')`
  color: ${p => p.theme.gray3};
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  border-bottom: 1px solid ${p => p.theme.borderDark};
  background: ${p => p.theme.offWhite};
  line-height: 1;

  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;

  padding: ${space(2)};

  /**
   * By default, a grid item cannot be smaller than the size of its content.
   * We override this by setting it to be 0.
   */
  min-width: 0;
`;

type PanelGridInfoProps = {
  numOfCols: number;
};

const PanelGridInfo = styled('div')<PanelGridInfoProps>`
  ${(props: PanelGridInfoProps) => {
    return `grid-column: 1 / span ${props.numOfCols};`;
  }};
`;

const PanelItemCell = styled('div')<{hideBottomBorder: boolean}>`
  border-bottom: ${p =>
    p.hideBottomBorder ? 'none' : `1px solid ${p.theme.borderLight}`};

  font-size: ${p => p.theme.fontSizeMedium};

  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  /**
   * By default, a grid item cannot be smaller than the size of its content.
   * We override this by setting it to be 0.
   */
  min-width: 0;
`;

const FloatingLoadingContainer = styled(LoadingContainer)<LoadingContainer['props']>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
`;
