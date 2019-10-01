import React from 'react';

import {Team, Organization} from 'app/types';
import getDisplayName from 'app/utils/getDisplayName';
import {Client} from 'app/api';

// We require these props when using this HOC
type DependentProps = {
  api: Client;
  organization: Organization;
};

type InjectedTeamsProps = {
  teams: Team[];
  loadingTeams: boolean;
};

type State = {
  teams: Team[];
  loadingTeams: boolean;
};

const withUsersTeams = <P extends InjectedTeamsProps>(
  WrappedComponent: React.ComponentType<P>
) =>
  class extends React.Component<
    Omit<P, keyof InjectedTeamsProps> & Partial<InjectedTeamsProps> & DependentProps,
    State
  > {
    static displayName = `withUsersTeams(${getDisplayName(WrappedComponent)})`;

    state = {
      teams: [],
      loadingTeams: true,
    };

    componentDidMount() {
      this.fetchTeams();
    }

    fetchTeams() {
      this.setState({
        loadingTeams: true,
      });
      this.props.api.requestPromise(this.getUsersTeamsEndpoint()).then((data: Team[]) => {
        this.setState({
          teams: data,
          loadingTeams: false,
        });
      });
    }

    getUsersTeamsEndpoint() {
      return `/organizations/${this.props.organization.slug}/teams/`;
    }

    render() {
      return (
        <WrappedComponent
          {...this.props as (P & DependentProps)}
          loadingTeams={this.state.loadingTeams}
          teams={this.state.teams as Team[]}
        />
      );
    }
  };

export default withUsersTeams;
