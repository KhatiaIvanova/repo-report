/* eslint-disable no-magic-numbers */
/* eslint-disable no-await-in-loop */

'use strict';

const { graphql } = require('@octokit/graphql');
const logSymbols = require('log-symbols');
const Table = require('cli-table');

// Field names and their extraction method to be used on the query result
const fields = [
	'Repository', 'Owner', 'Access', 'DefBranch', 'isPublic',
];
const mappedFields = [
	(item) => item.name,
	(item) => item.owner.login,
	(item) => item.viewerPermission,
	(item) => (item.defaultBranchRef ? item.defaultBranchRef.name : '---'),
	(item) => (item.isPrivate ? logSymbols.error : logSymbols.success),
];

const listFields = () => fields.map((item) => console.log(`- ${item}`));

const getGroupIndex = (group) => fields
	.map((item) => item.toLowerCase())
	.indexOf(group.toLowerCase());

const generateQuery = (endCursor) => `
query {
  viewer {
	repositories(
	  first: 100
	  affiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR]
	  ${endCursor ? `after: "${endCursor}"` : ''}
	) {
	  totalCount
	  pageInfo {
		endCursor
		hasNextPage
	  }
	  nodes {
		name
		owner {
		  login
		}
		isPrivate
		defaultBranchRef {
			name
		}
		viewerPermission
	  }
	}
  }
  rateLimit {
	cost
	remaining
  }
}
`;

const printAPIPoints = (points) => {
	console.log(`API Points:
\tused\t\t-\t${points.cost}
\tremaining\t-\t${points.remaining}`);
};

const generateTable = (repositories, groupBy, sort) => {
	let table;
	if (groupBy) {
		table = new Table({
			head: [fields[groupBy], 'Repository'],
		});
		const groupedObj = {};
		repositories.forEach((item) => {
			const key = mappedFields[groupBy](item);
			if (key in groupedObj) {
				groupedObj[key].push(item.name);
			} else { groupedObj[key] = [item.name]; }
		});

		Object.entries(groupedObj).forEach((item) => {
			const [key, value] = item;
			table.push([key, value.join('\n')]);
		});
	} else {
	
		table = new Table({
			head: fields,
		});

		if (sort) {
			repositories.sort((a, b) =>
			(a.name.toLowerCase() > b.name.toLowerCase() ? 1 : b.name.toLowerCase() > a.name.toLowerCase() ? -1 : 0));
		}

		repositories.forEach((item) => {
			table.push(mappedFields.map((func) => func(item)));
		});

	}
	return table;
};

const list = async (flags) => {
	// Handle Token not found error
	if (!process.env.GITHUB_PAT) {
		console.log(`${logSymbols.error} env variable GITHUB_PAT not found`);
		return null;
	}

	// List available fields
	if (flags.f) {
		return listFields();
	}

	// Get index of field to be grouped by
	let groupBy;
	if (flags.g) {
		groupBy = getGroupIndex(flags.g);
		if (groupBy === -1) {
			console.log(`${logSymbols.error} Invalid Field`);
			return null;
		}
	}



	// Repeated requests to get all repositories
	let endCursor,
		hasNextPage,
		points = { cost: 0 },
		repositories = [];

	do {
		const {
			viewer: {
				repositories: { nodes, pageInfo },
			},
			rateLimit,
		} = await graphql(
			generateQuery(endCursor),
			{
				headers: {
					authorization: `token ${process.env.GITHUB_PAT}`,
				},
			},
		);

		endCursor = pageInfo.endCursor;
		hasNextPage = pageInfo.hasNextPage;
		points.cost += rateLimit.cost;
		points.remaining = rateLimit.remaining;
		repositories = repositories.concat(nodes);
	} while (hasNextPage);

	let table;

	// Generate output table
	if (flags.g) {
		table = generateTable(repositories, groupBy);
	} 
	else if (flags.s) {
		table = generateTable(repositories, false, true);
	}
	
	else {
		table = generateTable(repositories);
	}

	console.log(table.toString());

	printAPIPoints(points);
	return null;
};

module.exports = list;
