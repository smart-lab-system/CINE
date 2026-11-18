

/*Complete the function below*/

class Solution {
    // Function to detect cycle in a directed graph.
    public boolean isCyclic(ArrayList<ArrayList<Integer>> adj) {
        // code here
        int n = adj.size();
        int[] current_path = new int[n];
        
        int[] visited = new int[n];
        
        for(int i = 0; i < n ; i++){
            if(visited[i] == 0){
                boolean ans= dfs(i,adj,current_path,visited);
                
                if(ans == true){
                    return true;
                }
            }
        }
        
        current_path[node] = 0;
        
        return false;
    }
    
    public boolean dfs(int node,ArrayList<ArrayList<Integer>> adj,int[] current_path,int[] visited){
        
        visited[node] = 1;
        
        current_path[node] = 1;
        
        for(int nbr : adj.get(node)){
            if(visited[nbr] == 0){
                boolean ans = dfs(nbr,adj,current_path,visited);
                if(ans == true){
                    return true;
                }
            }
            else if (current_path[nbr] == 1){
                return true;
            }
        }
        
        return false;
    }
}