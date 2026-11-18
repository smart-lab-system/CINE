

/*Complete the function below*/

class Solution {
    // Function to detect cycle in a directed graph.
    public boolean isCyclic(ArrayList<ArrayList<Integer>> adj) {
        // code here
        int []deg = new int[adj.size()];
        for(int i=0;i<adj.size();i++){
            for(int nbr : adj.get(i)){
                deg[nbr]++;
            }
        }
        Queue<Integer>q = new LinkedList<>();
        for(int i=0;i<adj.size();i++){
            if(deg[i]==0){
                q.add(i);
            }
        }
        int count=0;
        while(q.size()>0){
            int rem = q.remove();
            count++;
            ArrayList<Integer>temp = adj.get(rem);
            for(int t:temp){
                deg[t]--;
                if(deg[t]==0){
                    q.add(t);
                }
            }
        }
        return count!=adj.size();
    }
}