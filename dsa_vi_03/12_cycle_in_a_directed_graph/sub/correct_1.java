

/*Complete the function below*/

class Solution {
    // Function to detect cycle in a directed graph.
    public boolean isCyclic(ArrayList<ArrayList<Integer>> adj) {

       int vertices = adj.size();
       boolean visited [] = new boolean [vertices];
       boolean rec [] = new boolean [vertices];
      
       for(int i=0;i<adj.size();i++){
           if(visited[i]==false){
                if( dfs(i,adj,visited,rec)){
                    return true;
                }
           }
       }
       return false;
    }
    
    private boolean dfs(int node,ArrayList<ArrayList<Integer>> adj,boolean visit[],boolean rec[]){
         visit[node]=true;
         rec[node]=true;
// process all neighbour         
         for(int v : adj.get(node)){
             if(rec[v]){
                 return true;
             }
             if(visit[v]==false){
                 if(dfs(v,adj,visit,rec)){
                     return true;
                 }
             }
         }
         rec[node]=false;
         return false;
    }
}