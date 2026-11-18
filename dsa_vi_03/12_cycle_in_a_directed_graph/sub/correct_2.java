

/*Complete the function below*/

class Solution {
    // Function to detect cycle in a directed graph.
    public boolean isCyclic(ArrayList<ArrayList<Integer>> adj) {
        // code here
        int n=adj.size();
        boolean visited[]=new boolean[n];
        boolean pathV[]=new boolean[n];
        for(int i=0;i<n;i++)
        {
            if(!visited[i])
                if(dfs(i,visited,pathV,adj))
                    return true;
                    
        }
        return false;
    }
    
    public boolean dfs(int vertex,boolean visited[],boolean pathV[],ArrayList<ArrayList<Integer>> adj)
    {
        visited[vertex]=true;
        pathV[vertex]=true;
        for(int neigh:adj.get(vertex))
        {
            if(!visited[neigh])
            {
                if(dfs(neigh,visited,pathV,adj))
                    return true;
            }
            else if(pathV[neigh])
                return true;
        }
        pathV[vertex]=false;
        
        return false;
    }
}