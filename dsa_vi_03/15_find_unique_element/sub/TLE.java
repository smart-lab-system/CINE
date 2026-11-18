
class Solution {
    public int findUnique(int k, int[] arr) {
        // code here
        
        ArrayList<Integer> l1=new ArrayList();
        int unique=0;
        
        for(int num:arr)
        {
            l1.add(num);
        }
        
    for(int i=0;i<l1.size();i++)
    {
        int number=Collections.frequency(l1,l1.get(i));
        
        if(number==1)
        {
            unique=l1.get(i);
            break;
        }
    }
    
    
       return unique;
        
        
        
    }
}